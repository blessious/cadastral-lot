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
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────────────
CSV_FILE    = Path(r"C:\Users\admin\Videos\CADASTRAL LOT MAP\Cadastral - Barangay\Cadastral_Data_WithOwner.csv")
GEOJSON_DIR = Path(r"C:\Users\admin\Videos\CADASTRAL LOT MAP\output\geojson")
SEARCH_IDX  = Path(r"C:\Users\admin\Videos\CADASTRAL LOT MAP\generate_search_index.py")
# ─────────────────────────────────────────────────────────────────────────────


def load_owner_map() -> dict[str, dict]:
    """
    Returns { pin -> {"ownerName": str, "tdno": str} }
    Also builds a CLN-based fallback map since some GeoJSONs use CLN not PIN.
    """
    pin_map: dict[str, dict] = {}
    cln_map: dict[str, dict] = {}

    with open(CSV_FILE, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pin  = (row.get("pin")  or "").strip()
            tdno = (row.get("tdno") or "").strip()
            cln  = (row.get("cadastralL") or "").strip()
            owner = (row.get("ownerName") or "").strip()

            if not owner:
                continue
            payload = {"ownerName": owner, "tdno": tdno}
            if pin:
                pin_map[pin] = payload
            if cln:
                # CLN can look like "2378" or "2378 PT." — normalize
                cln_key = cln.split()[0].strip()
                cln_map[cln_key] = payload

    print(f"[OK] Loaded {len(pin_map):,} PIN entries, {len(cln_map):,} CLN entries from CSV.")
    return pin_map, cln_map


def enrich_file(geojson_path: Path, pin_map: dict, cln_map: dict) -> tuple[int, int]:
    """
    Enriches a single GeoJSON file with Owner and TaxDecNo properties.
    Returns (matched, total) counts.
    """
    with open(geojson_path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    features = data.get("features", [])
    matched = 0

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
            props["Owner"]     = payload["ownerName"]
            props["TaxDecNo"]  = payload["tdno"]
            feature["properties"] = props
            matched += 1

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)

    return matched, len(features)


def main():
    pin_map, cln_map = load_owner_map()

    geojson_files = sorted(GEOJSON_DIR.glob("*.geojson"))
    geojson_files = [f for f in geojson_files if f.stem not in ("boac_all", "search_index")]

    total_matched = 0
    total_features = 0

    print(f"\nEnriching {len(geojson_files)} GeoJSON files...\n")
    for i, gf in enumerate(geojson_files, 1):
        matched, total = enrich_file(gf, pin_map, cln_map)
        total_matched   += matched
        total_features  += total
        pct = f"{matched/total*100:.0f}%" if total else "0%"
        print(f"  [{i:02d}/{len(geojson_files)}] {gf.name:<40} {matched:>4}/{total} lots enriched ({pct})")

    print(f"\n[OK] Total: {total_matched:,} / {total_features:,} features enriched with owner name.")

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
