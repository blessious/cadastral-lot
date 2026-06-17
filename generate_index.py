"""
generate_index.py
Generates /public/geojson/index.json
Used by the web app for lazy loading barangay GeoJSON by viewport bbox.

Output format:
[
  {
    "name": "Agot",
    "file": "/geojson/Agot.geojson",
    "bbox": [minLng, minLat, maxLng, maxLat],
    "lot_count": 302
  },
  ...
]

Usage:
    python generate_index.py

Edit GEOJSON_DIR to point to your /public/geojson/ folder.
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

# ── CONFIG ──────────────────────────────────────────────────
GEOJSON_DIR = PROJECT_ROOT / "output" / "geojson"
OUTPUT_FILE = GEOJSON_DIR / "index.json"
# ────────────────────────────────────────────────────────────


def get_bbox(features: list) -> list[float] | None:
    """Compute [minLng, minLat, maxLng, maxLat] from a list of GeoJSON features."""
    min_lng = min_lat = float("inf")
    max_lng = max_lat = float("-inf")

    def process_coords(coords):
        nonlocal min_lng, min_lat, max_lng, max_lat
        if isinstance(coords[0], list):
            for c in coords:
                process_coords(c)
        else:
            lng, lat = coords[0], coords[1]
            if min_lng > lng: min_lng = lng
            if max_lng < lng: max_lng = lng
            if min_lat > lat: min_lat = lat
            if max_lat < lat: max_lat = lat

    for feature in features:
        geom = feature.get("geometry")
        if geom and geom.get("coordinates"):
            process_coords(geom["coordinates"])

    if min_lng == float("inf"):
        return None
    return [
        round(min_lng, 6),
        round(min_lat, 6),
        round(max_lng, 6),
        round(max_lat, 6)
    ]


def main():
    geojson_files = sorted(GEOJSON_DIR.glob("*.geojson"))

    # Exclude the merged file
    geojson_files = [f for f in geojson_files if f.stem != "boac_all"]

    if not geojson_files:
        print(f"[ERROR] No .geojson files found in:\n  {GEOJSON_DIR}")
        return

    print(f"Found {len(geojson_files)} barangay GeoJSON files.\nBuilding index...\n")

    index = []

    for i, geojson_file in enumerate(geojson_files, 1):
        print(f"[{i:03d}/{len(geojson_files)}] {geojson_file.name} ... ", end="", flush=True)

        try:
            with open(geojson_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            features = data.get("features", [])
            bbox = get_bbox(features)

            if bbox is None:
                print("SKIP (no geometry)")
                continue

            index.append({
                "name": geojson_file.stem,
                "file": f"/geojson/{geojson_file.name}",
                "bbox": bbox,
                "lot_count": len(features)
            })

            print(f"OK  ({len(features)} lots, bbox: {bbox})")

        except Exception as e:
            print(f"ERROR: {e}")

    # Write output
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)

    print(f"\n✓ index.json written → {OUTPUT_FILE}")
    print(f"  Total barangays indexed: {len(index)}")


if __name__ == "__main__":
    main()
