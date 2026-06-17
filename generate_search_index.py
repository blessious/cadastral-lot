"""
generate_search_index.py
Generates /public/geojson/search_index.json
Used by the web app SearchBar to search across all lots without loading full geometries.

Output format:
[
  {
    "CLN": "123-456",
    "ALN": "789",
    "PIN": "101-112",
    "Barangay": "Agot",
    "Section": "A",
    "Land_Class": "Agricultural",
    "Area": "500",
    "file": "/geojson/Agot.geojson"
  },
  ...
]

Usage:
    python generate_search_index.py

Edit GEOJSON_DIR to point to your /public/geojson/ folder.
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

# ── CONFIG ──────────────────────────────────────────────────
GEOJSON_DIR = PROJECT_ROOT / "boac-gis" / "public" / "geojson"
OUTPUT_FILE = GEOJSON_DIR / "search_index.json"

# Fields to include in the search index (no geometry)
SEARCH_FIELDS = ["CLN", "ALN", "PIN", "Barangay", "barangay", "Section", "Land_Class", "LAND_CLASS", "Area", "Area_1", "Brgy_Code", "PSGC", "Owner", "OWNER", "Claimant", "CLAIMANT"]
# ────────────────────────────────────────────────────────────


def normalize_props(props: dict, file_name: str) -> dict:
    """
    Extract and normalize only the search fields from a feature's properties.
    Handles case inconsistencies (Land_Class vs LAND_CLASS, etc.)
    """
    entry = {"file": f"/geojson/{file_name}"}

    for field in SEARCH_FIELDS:
        val = props.get(field)
        if val is not None and str(val).strip() not in ("", "None", "null"):
            # Normalize key casing to consistent names
            key = field
            if field == "LAND_CLASS":
                key = "Land_Class"
            if field == "Area_1":
                key = "Area"  # merge Area_1 into Area if Area is missing
            if field in ["OWNER", "Claimant", "CLAIMANT"]:
                key = "Owner"
            # Don't overwrite if already set
            if key not in entry or entry[key] in (None, ""):
                entry[key] = str(val).strip()

    # Normalize barangay: use uppercase Barangay if available, fallback to lowercase
    if "Barangay" not in entry and "barangay" in entry:
        entry["Barangay"] = entry.pop("barangay")
    elif "barangay" in entry:
        del entry["barangay"]  # remove duplicate lowercase

    return entry


def main():
    geojson_files = sorted(GEOJSON_DIR.glob("*.geojson"))
    geojson_files = [f for f in geojson_files if f.stem != "boac_all"]

    if not geojson_files:
        print(f"[ERROR] No .geojson files found in:\n  {GEOJSON_DIR}")
        return

    print(f"Found {len(geojson_files)} barangay GeoJSON files.\nBuilding search index...\n")

    search_index = []
    total_lots = 0
    skipped = 0

    for i, geojson_file in enumerate(geojson_files, 1):
        print(f"[{i:03d}/{len(geojson_files)}] {geojson_file.name} ... ", end="", flush=True)

        try:
            with open(geojson_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            features = data.get("features", [])
            count = 0

            for idx, feature in enumerate(features):
                props = feature.get("properties") or {}

                # Skip features with no useful identifiers
                if not any(props.get(k) for k in ["CLN", "PIN", "ALN"]):
                    skipped += 1
                    continue

                entry = normalize_props(props, geojson_file.name)
                entry["__uid"] = f"/geojson/{geojson_file.name}-{idx}"
                search_index.append(entry)
                count += 1

            total_lots += count
            print(f"OK  ({count} lots indexed)")

        except Exception as e:
            print(f"ERROR: {e}")

    # Write output
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(search_index, f, separators=(",", ":"))  # compact, no indent = smaller file

    file_size_kb = OUTPUT_FILE.stat().st_size / 1024
    print(f"\n[DONE] search_index.json written -> {OUTPUT_FILE}")
    print(f"  Total lots indexed : {total_lots}")
    print(f"  Skipped (no ID)    : {skipped}")
    print(f"  File size          : {file_size_kb:.1f} KB")

    if file_size_kb > 5000:
        print(f"\n  [WARN] File is large ({file_size_kb:.0f} KB). Consider serving it from an API instead.")
    else:
        print(f"\n  [OK] Safe to serve as static JSON from /public/geojson/")


if __name__ == "__main__":
    main()
