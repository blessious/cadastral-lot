"""
enrich_geojson_owner.py
-----------------------
Reads the owner name from Cadastral_Data_WithOwner.csv (joined from ETRACS)
and embeds it as the "Owner" property into every matching GeoJSON feature,
matching on PIN (Property Identification Number).

After enrichment, also re-runs the search index so SearchBar picks up owners.

Usage:
    python enrich_geojson_owner.py
"""

import csv
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

# ── CONFIG ────────────────────────────────────────────────────────────────────
CSV_FILE    = PROJECT_ROOT / "Cadastral - Barangay" / "Cadastral_Data_WithOwner.csv"
GEOJSON_DIR = PROJECT_ROOT / "output" / "geojson"
SEARCH_IDX  = PROJECT_ROOT / "generate_search_index.py"
# ─────────────────────────────────────────────────────────────────────────────


def payload_signature(payload: dict) -> tuple[str, str, str]:
    return (payload["ownerName"], payload["tdno"], payload["landClass"])


def add_unique_cln_payload(cln_map: dict, ambiguous_clns: set, cln_key: str, payload: dict) -> None:
    """
    Keep CLN fallback only when a cadastral lot number maps to one payload.
    CLN alone is not globally unique, so conflicting payloads must not guess.
    """
    if cln_key in ambiguous_clns:
        return

    existing = cln_map.get(cln_key)
    if existing is None:
        cln_map[cln_key] = payload
        return

    if payload_signature(existing) != payload_signature(payload):
        cln_map.pop(cln_key, None)
        ambiguous_clns.add(cln_key)


def load_owner_map() -> tuple[dict, dict, set]:
    """
    Returns { pin -> {"ownerName": str, "tdno": str} }
    Also builds a CLN-based fallback map since some GeoJSONs use CLN not PIN.
    """
    pin_map: dict[str, dict] = {}
    cln_map: dict[str, dict] = {}
    ambiguous_clns: set[str] = set()

    with open(CSV_FILE, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pin  = (row.get("pin")  or "").strip()
            tdno = (row.get("tdno") or "").strip()
            cln  = (row.get("cadastralL") or "").strip()
            owner = (row.get("ownerName") or "").strip()
            land_class = (row.get("classTitle") or "").strip()

            if not owner and not land_class:
                continue
            payload = {"ownerName": owner, "tdno": tdno, "landClass": land_class}
            if pin:
                pin_map[pin] = payload
            if cln:
                # CLN can look like "2378" or "2378 PT." — normalize
                cln_key = cln.split()[0].strip()
                add_unique_cln_payload(cln_map, ambiguous_clns, cln_key, payload)

    print(f"[OK] Loaded {len(pin_map):,} PIN entries, {len(cln_map):,} unambiguous CLN entries from CSV.")
    if ambiguous_clns:
        print(f"[WARN] Skipped {len(ambiguous_clns):,} ambiguous CLN fallback keys to avoid wrong owner matches.")
    return pin_map, cln_map, ambiguous_clns


def enrich_file(geojson_path: Path, pin_map: dict, cln_map: dict, ambiguous_clns: set) -> tuple[int, int, int]:
    """
    Enriches a single GeoJSON file with Owner and TaxDecNo properties.
    Returns (matched, total) counts.
    """
    with open(geojson_path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    features = data.get("features", [])
    matched = 0
    ambiguous_skipped = 0

    for feature in features:
        props = feature.get("properties") or {}

        # Already has an owner? skip to avoid overwriting manual data
        # (remove this check if you want to always overwrite from ETRACS)
        # if props.get("Owner"):
        #     continue

        pin = str(props.get("PIN") or "").strip()
        cln_parts = str(props.get("CLN") or "").strip().split()
        cln = cln_parts[0] if cln_parts else ""

        payload = pin_map.get(pin) or cln_map.get(cln)

        if payload:
            if payload["ownerName"]:
                props["Owner"]     = payload["ownerName"]
            if payload["tdno"]:
                props["TaxDecNo"]  = payload["tdno"]
            if payload["landClass"]:
                props["Land_Class"] = payload["landClass"]
                
            feature["properties"] = props
            matched += 1
        elif not pin and cln in ambiguous_clns:
            had_owner = props.pop("Owner", None) is not None
            had_taxdec = props.pop("TaxDecNo", None) is not None
            if had_owner or had_taxdec:
                feature["properties"] = props
            ambiguous_skipped += 1

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)

    return matched, len(features), ambiguous_skipped


def clear_ambiguous_no_pin_cln_outputs(geojson_files: list[Path]) -> int:
    """
    Final safety pass over generated GeoJSON files.
    If a no-PIN feature's CLN points at multiple PIN-backed owners in the
    generated data, clear Owner/TaxDecNo instead of keeping a guessed match.
    """
    documents = {}
    pin_payloads_by_cln = defaultdict(set)

    for path in geojson_files:
        if not path.exists():
            continue
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
        documents[path] = data

        for feature in data.get("features", []):
            props = feature.get("properties") or {}
            pin = str(props.get("PIN") or "").strip()
            cln_parts = str(props.get("CLN") or "").strip().split()
            cln = cln_parts[0] if cln_parts else ""
            owner = str(props.get("Owner") or "").strip()
            tdno = str(props.get("TaxDecNo") or "").strip()
            if pin and cln and (owner or tdno):
                pin_payloads_by_cln[cln].add((owner, tdno))

    cleared = 0
    changed_paths = set()

    for path, data in documents.items():
        for feature in data.get("features", []):
            props = feature.get("properties") or {}
            pin = str(props.get("PIN") or "").strip()
            cln_parts = str(props.get("CLN") or "").strip().split()
            cln = cln_parts[0] if cln_parts else ""
            owner = str(props.get("Owner") or "").strip()
            tdno = str(props.get("TaxDecNo") or "").strip()
            candidates = pin_payloads_by_cln.get(cln, set())

            if pin or not cln or not (owner or tdno) or not candidates:
                continue

            if len(candidates) > 1 or (owner, tdno) not in candidates:
                props.pop("Owner", None)
                props.pop("TaxDecNo", None)
                feature["properties"] = props
                changed_paths.add(path)
                cleared += 1

    for path in changed_paths:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(documents[path], f, separators=(",", ":"), ensure_ascii=False)

    return cleared


def main():
    pin_map, cln_map, ambiguous_clns = load_owner_map()

    geojson_files = sorted(GEOJSON_DIR.glob("*.geojson"))
    geojson_files = [f for f in geojson_files if f.stem not in ("boac_all", "search_index")]

    total_matched = 0
    total_features = 0
    total_ambiguous_skipped = 0

    print(f"\nEnriching {len(geojson_files)} GeoJSON files...\n")
    for i, gf in enumerate(geojson_files, 1):
        matched, total, ambiguous_skipped = enrich_file(gf, pin_map, cln_map, ambiguous_clns)
        total_matched   += matched
        total_features  += total
        total_ambiguous_skipped += ambiguous_skipped
        pct = f"{matched/total*100:.0f}%" if total else "0%"
        skipped = f", {ambiguous_skipped} ambiguous CLN skipped" if ambiguous_skipped else ""
        print(f"  [{i:02d}/{len(geojson_files)}] {gf.name:<40} {matched:>4}/{total} lots enriched ({pct}){skipped}")

    print(f"\n[OK] Total: {total_matched:,} / {total_features:,} features enriched with owner name.")
    if total_ambiguous_skipped:
        print(f"[WARN] Cleared/skipped owner data for {total_ambiguous_skipped:,} no-PIN features with ambiguous CLN.")

    post_clear_count = clear_ambiguous_no_pin_cln_outputs(geojson_files)
    if post_clear_count:
        print(f"[WARN] Cleared {post_clear_count:,} additional no-PIN owner guesses after global GeoJSON CLN validation.")

    # Re-generate search index so SearchBar picks up Owner field
    print("\n[...] Re-generating search_index.json ...")
    result = subprocess.run([sys.executable, str(SEARCH_IDX)], capture_output=True, text=True)
    if result.returncode == 0:
        print("[OK] search_index.json updated.")
    else:
        print(f"[WARN] search_index.py error:\n{result.stderr}")

    print("\nDone! Copy output/geojson/ into boac-gis/public/geojson/ to deploy.")
    print("No UI code changes needed - LotInfoPanel and SearchBar already read 'Owner'.")


if __name__ == "__main__":
    main()
