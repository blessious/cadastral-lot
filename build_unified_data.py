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
import re
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
    text = str(value or "").strip().upper()
    if not text or text in {"NULL", "NONE", "N/A"}:
        return ""
    return re.split(r"[\s,(/]+", text, maxsplit=1)[0].strip(".,;:")


def normalize_location(value: object) -> str:
    text = str(value or "").strip().upper()
    aliases = {
        "BANBANGALON": "BANGBANGALON",
        "SABONGS": "SABONG",
    }
    return aliases.get(text, text)


def payload_signature(payload: dict[str, str]) -> tuple[str, str, str]:
    return (payload["ownerName"], payload["tdno"], payload["landClass"])


def add_unique_payload(
    lookup: dict[object, dict[str, str]],
    ambiguous_keys: set[object],
    key: object,
    payload: dict[str, str],
) -> None:
    if not key or key in ambiguous_keys:
        return

    existing = lookup.get(key)
    if existing is None:
        lookup[key] = payload
        return

    if payload_signature(existing) != payload_signature(payload):
        lookup.pop(key, None)
        ambiguous_keys.add(key)


def load_owner_map() -> tuple[
    dict[str, dict[str, str]],
    dict[tuple[str, str], dict[str, str]],
    set[str],
    set[tuple[str, str]],
]:
    """
    Returns safe taxpayer maps from the CSV.
    PIN is the primary join key. A conflicting duplicate PIN is never guessed.
    CLN fallback is scoped to barangay/location and is only used when that
    (CLN, location) pair resolves to exactly one taxpayer payload.
    """
    if not CSV_FILE.exists():
        raise FileNotFoundError(f"CSV source not found: {CSV_FILE}")

    pin_map: dict[str, dict[str, str]] = {}
    cln_location_map: dict[tuple[str, str], dict[str, str]] = {}
    ambiguous_pins: set[str] = set()
    ambiguous_cln_locations: set[tuple[str, str]] = set()
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
            location = normalize_location(row.get("location"))
            owner = (row.get("taxpayerName") or "").strip()
            tdno = (row.get("tdno") or "").strip()
            land_class = (row.get("classTitle") or "").strip()

            if not owner and not tdno and not land_class:
                continue

            payload = {
                "ownerName": owner,
                "tdno": tdno,
                "landClass": land_class,
                "location": location,
            }
            if pin:
                add_unique_payload(pin_map, ambiguous_pins, pin, payload)
            if cln and location:
                add_unique_payload(
                    cln_location_map,
                    ambiguous_cln_locations,
                    (cln, location),
                    payload,
                )

    print(
        f"[OK] Loaded {rows:,} CSV rows, {len(pin_map):,} safe PIN entries, "
        f"{len(cln_location_map):,} safe CLN+barangay entries."
    )
    if ambiguous_pins:
        print(f"[WARN] Skipped {len(ambiguous_pins):,} conflicting duplicate PIN keys.")
    if ambiguous_cln_locations:
        print(f"[WARN] Skipped {len(ambiguous_cln_locations):,} ambiguous CLN+barangay fallback keys.")

    return pin_map, cln_location_map, ambiguous_pins, ambiguous_cln_locations


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
    cln_location_map: dict[tuple[str, str], dict[str, str]],
    ambiguous_pins: set[str],
    ambiguous_cln_locations: set[tuple[str, str]],
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
    cleared_unsafe = 0
    geo_recovered = 0

    for feature in features:
        props = feature.get("properties") or {}
        pin = str(props.get("PIN") or "").strip()
        cln = normalize_cln(props.get("CLN"))
        barangay = normalize_location(props.get("Barangay") or props.get("barangay") or src_path.stem)

        if feature.get("geometry") is None and (pin_geo or cln_geo):
            geometry = pin_geo.get(pin) or cln_geo.get(cln)
            if geometry:
                feature["geometry"] = geometry
                geo_recovered += 1

        payload = None
        if pin and pin in pin_map:
            payload = pin_map[pin]
        elif pin and pin in ambiguous_pins:
            ambiguous_skipped += 1
        elif cln and barangay and (cln, barangay) in cln_location_map:
            payload = cln_location_map[(cln, barangay)]
        elif cln and barangay and (cln, barangay) in ambiguous_cln_locations:
            ambiguous_skipped += 1

        if payload:
            if payload["ownerName"]:
                props["Owner"] = payload["ownerName"]
            if payload["tdno"]:
                props["TaxDecNo"] = payload["tdno"]
            if payload["landClass"]:
                props["Land_Class"] = payload["landClass"]
            feature["properties"] = props
            matched += 1
        else:
            had_owner = props.pop("Owner", None) is not None
            had_owner_upper = props.pop("OWNER", None) is not None
            had_claimant = props.pop("Claimant", None) is not None
            had_claimant_upper = props.pop("CLAIMANT", None) is not None
            had_taxdec = props.pop("TaxDecNo", None) is not None
            if had_owner or had_owner_upper or had_claimant or had_claimant_upper or had_taxdec:
                feature["properties"] = props
                cleared_unsafe += 1

    if geo_recovered:
        print(f"    [GEO] Injected geometry into {geo_recovered}/{len(features)} features.")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as file:
        json.dump(data, file, separators=(",", ":"), ensure_ascii=False)

    return matched, len(features), ambiguous_skipped + cleared_unsafe, geo_recovered


def main() -> None:
    try:
        pin_map, cln_location_map, ambiguous_pins, ambiguous_cln_locations = load_owner_map()
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
                geojson_file,
                out_file,
                pin_map,
                cln_location_map,
                ambiguous_pins,
                ambiguous_cln_locations,
            )
            total_matched += matched
            total_features += total
            total_ambiguous_skipped += ambiguous_skipped
            total_geo_recovered += geo_recovered
            pct = f"{matched / total * 100:.0f}%" if total else "0%"
            skipped = f", {ambiguous_skipped} unsafe owner values cleared/skipped" if ambiguous_skipped else ""
            print(
                f"  [{index:02d}/{len(geojson_files)}] {geojson_file.name:<40} "
                f"{matched:>4}/{total} lots enriched ({pct}){skipped}"
            )
        except Exception as error:
            print(f"  [{index:02d}/{len(geojson_files)}] [ERROR] {geojson_file.name}: {error}")

    print(f"\n[OK] Total: {total_matched:,} / {total_features:,} features enriched from CSV.")
    if total_ambiguous_skipped:
        print(f"[WARN] Cleared/skipped {total_ambiguous_skipped:,} unsafe owner values.")
    if total_geo_recovered:
        print(f"[OK] Recovered geometry for {total_geo_recovered:,} features.")

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
