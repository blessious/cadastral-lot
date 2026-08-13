"""
build_unified_data.py
---------------------
Embeds taxpayer data into the public GeoJSON files without connecting to
ETRACS SQL Server.

Source data:
    CLN with taxpayerName.csv

The web app reads only static files for map/search data. SQL Server remains
used by the Next.js app only for login through dbo.gis_users.

Usage:
    python build_unified_data.py
"""

import csv
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

CSV_FILE = PROJECT_ROOT / "CLN with taxpayerName.csv"
GEOJSON_SRC_DIR = PROJECT_ROOT / "output" / "geojson"
GEOJSON_OUT_DIR = PROJECT_ROOT / "boac-gis" / "public" / "geojson"
GEOJSON_GEO_REF = GEOJSON_OUT_DIR
SEARCH_IDX = PROJECT_ROOT / "generate_search_index.py"


def normalize_cln(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return text.split()[0].strip().strip(",")


def payload_signature(payload: dict[str, str]) -> tuple[str, str, str]:
    return (payload["ownerName"], payload["tdno"], payload["landClass"])


def add_unique_cln_payload(
    cln_map: dict[str, dict[str, str]],
    ambiguous_clns: set[str],
    cln_key: str,
    payload: dict[str, str],
) -> None:
    """
    Keep CLN fallback only when a cadastral lot number maps to one payload.
    CLN alone is not globally unique, so conflicting payloads must not guess.
    """
    if not cln_key or cln_key in ambiguous_clns:
        return

    existing = cln_map.get(cln_key)
    if existing is None:
        cln_map[cln_key] = payload
        return

    if payload_signature(existing) != payload_signature(payload):
        cln_map.pop(cln_key, None)
        ambiguous_clns.add(cln_key)


def load_owner_map() -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]], set[str]]:
    """
    Returns (pin_map, cln_map, ambiguous_clns) from the CSV.
    PIN is the primary join key. CLN is only used when it resolves to exactly
    one taxpayer payload.
    """
    if not CSV_FILE.exists():
        raise FileNotFoundError(f"CSV source not found: {CSV_FILE}")

    pin_map: dict[str, dict[str, str]] = {}
    cln_map: dict[str, dict[str, str]] = {}
    ambiguous_clns: set[str] = set()
    rows = 0

    with CSV_FILE.open(newline="", encoding="utf-8-sig", errors="replace") as file:
        reader = csv.DictReader(file)
        required = {"tdno", "taxpayerName", "pin", "cadastralLotNo", "classTitle"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{CSV_FILE.name} is missing columns: {', '.join(sorted(missing))}")

        for row in reader:
            rows += 1
            pin = (row.get("pin") or "").strip()
            cln = normalize_cln(row.get("cadastralLotNo"))
            owner = (row.get("taxpayerName") or "").strip()
            tdno = (row.get("tdno") or "").strip()
            land_class = (row.get("classTitle") or "").strip()

            if not owner and not tdno and not land_class:
                continue

            payload = {"ownerName": owner, "tdno": tdno, "landClass": land_class}
            if pin:
                pin_map[pin] = payload
            if cln:
                add_unique_cln_payload(cln_map, ambiguous_clns, cln, payload)

    print(
        f"[OK] Loaded {rows:,} CSV rows, {len(pin_map):,} PIN entries, "
        f"{len(cln_map):,} unambiguous CLN entries."
    )
    if ambiguous_clns:
        print(f"[WARN] Skipped {len(ambiguous_clns):,} ambiguous CLN fallback keys.")

    return pin_map, cln_map, ambiguous_clns


def load_geometry_ref(ref_path: Path) -> tuple[dict[str, dict], dict[str, dict]]:
    """
    Loads a GeoJSON file and returns (pin_geo, cln_geo) lookup dicts.
    Used to recover geometry when the source file has geometry:null.
    """
    pin_geo: dict[str, dict] = {}
    cln_geo: dict[str, dict] = {}
    if not ref_path.exists():
        return pin_geo, cln_geo

    try:
        with ref_path.open("r", encoding="utf-8", errors="replace") as file:
            ref = json.load(file)
        for feature in ref.get("features", []):
            geometry = feature.get("geometry")
            if not geometry:
                continue
            props = feature.get("properties") or {}
            pin = str(props.get("PIN") or "").strip()
            cln = normalize_cln(props.get("CLN"))
            if pin:
                pin_geo[pin] = geometry
            if cln:
                cln_geo[cln] = geometry
    except Exception:
        pass

    return pin_geo, cln_geo


def enrich_file(
    src_path: Path,
    out_path: Path,
    pin_map: dict[str, dict[str, str]],
    cln_map: dict[str, dict[str, str]],
    ambiguous_clns: set[str],
) -> tuple[int, int, int, int]:
    """
    Reads base GeoJSON, embeds Owner/TaxDecNo/Land_Class from CSV, and recovers
    missing geometry from the existing public GeoJSON file.
    """
    with src_path.open("r", encoding="utf-8", errors="replace") as file:
        data = json.load(file)

    features = data.get("features", [])
    needs_geo = any(feature.get("geometry") is None for feature in features)
    pin_geo, cln_geo = ({}, {})
    if needs_geo:
        pin_geo, cln_geo = load_geometry_ref(GEOJSON_GEO_REF / out_path.name)
        if pin_geo or cln_geo:
            print(f"    [GEO] Recovering geometry from existing public file for {src_path.name}")

    matched = 0
    ambiguous_skipped = 0
    geo_recovered = 0

    for feature in features:
        props = feature.get("properties") or {}
        pin = str(props.get("PIN") or "").strip()
        cln = normalize_cln(props.get("CLN"))

        if feature.get("geometry") is None and (pin_geo or cln_geo):
            geometry = pin_geo.get(pin) or cln_geo.get(cln)
            if geometry:
                feature["geometry"] = geometry
                geo_recovered += 1

        payload = pin_map.get(pin) or cln_map.get(cln)
        if payload:
            if payload["ownerName"]:
                props["Owner"] = payload["ownerName"]
            if payload["tdno"]:
                props["TaxDecNo"] = payload["tdno"]
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

    if geo_recovered:
        print(f"    [GEO] Injected geometry into {geo_recovered}/{len(features)} features.")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as file:
        json.dump(data, file, separators=(",", ":"), ensure_ascii=False)

    return matched, len(features), ambiguous_skipped, geo_recovered


def clear_ambiguous_no_pin_cln_outputs(geojson_files: list[Path]) -> int:
    """
    If a no-PIN feature's CLN points at multiple PIN-backed owners in the
    generated data, clear Owner/TaxDecNo instead of keeping a guessed match.
    """
    documents = {}
    pin_payloads_by_cln: dict[str, set[tuple[str, str]]] = defaultdict(set)

    for path in geojson_files:
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8", errors="replace") as file:
            data = json.load(file)
        documents[path] = data

        for feature in data.get("features", []):
            props = feature.get("properties") or {}
            pin = str(props.get("PIN") or "").strip()
            cln = normalize_cln(props.get("CLN"))
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
            cln = normalize_cln(props.get("CLN"))
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
        with path.open("w", encoding="utf-8") as file:
            json.dump(documents[path], file, separators=(",", ":"), ensure_ascii=False)

    return cleared


def main() -> None:
    try:
        pin_map, cln_map, ambiguous_clns = load_owner_map()
    except Exception as error:
        print(f"\n[FATAL] Could not load CSV taxpayer data: {error}")
        sys.exit(1)

    geojson_files = sorted(GEOJSON_SRC_DIR.glob("*.geojson"))
    geojson_files = [
        path for path in geojson_files if path.stem not in ("boac_all", "search_index", "index")
    ]

    total_matched = 0
    total_features = 0
    total_ambiguous_skipped = 0
    total_geo_recovered = 0

    print(f"\nEnriching {len(geojson_files)} GeoJSON files and saving to public/geojson...\n")
    for index, geojson_file in enumerate(geojson_files, 1):
        out_file = GEOJSON_OUT_DIR / geojson_file.name
        try:
            matched, total, ambiguous_skipped, geo_recovered = enrich_file(
                geojson_file, out_file, pin_map, cln_map, ambiguous_clns
            )
            total_matched += matched
            total_features += total
            total_ambiguous_skipped += ambiguous_skipped
            total_geo_recovered += geo_recovered
            pct = f"{matched / total * 100:.0f}%" if total else "0%"
            skipped = f", {ambiguous_skipped} ambiguous CLN skipped" if ambiguous_skipped else ""
            print(
                f"  [{index:02d}/{len(geojson_files)}] {geojson_file.name:<40} "
                f"{matched:>4}/{total} lots enriched ({pct}){skipped}"
            )
        except Exception as error:
            print(f"  [{index:02d}/{len(geojson_files)}] [ERROR] {geojson_file.name}: {error}")

    print(f"\n[OK] Total: {total_matched:,} / {total_features:,} features enriched from CSV.")
    if total_ambiguous_skipped:
        print(f"[WARN] Cleared/skipped {total_ambiguous_skipped:,} no-PIN ambiguous CLN matches.")
    if total_geo_recovered:
        print(f"[OK] Recovered geometry for {total_geo_recovered:,} features.")

    generated_files = [GEOJSON_OUT_DIR / path.name for path in geojson_files]
    post_clear_count = clear_ambiguous_no_pin_cln_outputs(generated_files)
    if post_clear_count:
        print(f"[WARN] Cleared {post_clear_count:,} additional ambiguous no-PIN owner guesses.")

    print(f"\n[...] Re-generating search_index.json using {SEARCH_IDX.name} ...")
    if SEARCH_IDX.exists():
        result = subprocess.run([sys.executable, str(SEARCH_IDX)], capture_output=True, text=True)
        if result.returncode == 0:
            print(result.stdout.strip())
            print("[OK] Search index updated.")
        else:
            print(f"[WARN] search_index.py error:\n{result.stderr}")
    else:
        print(f"[WARN] Search index script not found at {SEARCH_IDX}")

    print("\n[DONE] Static GeoJSON owner data is ready. No ETRACS SQL connection was used.")


if __name__ == "__main__":
    main()
