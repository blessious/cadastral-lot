"""
Batch Shapefile to GeoJSON Converter
Boac, Marinduque - Cadastral Barangay Shape Files
---------------------------------------------------
Usage:
    python convert_shapefiles.py

Requirements:
    pip install geopandas

Output:
    - /output/geojson/<BarangayName>.geojson  (one per barangay)
    - /output/geojson/boac_all.geojson        (merged all barangays)
    - /output/conversion_report.txt           (summary log)
"""

import geopandas as gpd
import pandas as pd
from pathlib import Path
import json
import sys
import traceback
from datetime import datetime

# ─────────────────────────────────────────────
# CONFIGURATION — edit this to match your setup
# ─────────────────────────────────────────────

# Root folder containing all barangay shape file folders
# Example: r"\\192.168.1.245\GIS Files\Shape Files\Boundary\Cadastral - Barangay"
INPUT_ROOT = Path(r"C:\Users\admin\Videos\CADASTRAL LOT MAP\Cadastral - Barangay")

# Where to save output GeoJSON files
OUTPUT_DIR = Path("output/geojson")

# Target coordinate system for web maps (WGS84 / GPS standard)
TARGET_CRS = "EPSG:4326"

# Whether to also merge all barangays into one combined GeoJSON
MERGE_ALL = True

# ─────────────────────────────────────────────


def find_shapefiles(root: Path) -> list[Path]:
    """Recursively find all .shp files under root."""
    return sorted(root.rglob("*.shp"))


def convert_shapefile(shp_path: Path, output_dir: Path) -> dict:
    """
    Convert a single .shp file to GeoJSON.
    Returns a result dict with status info.
    """
    result = {
        "file": shp_path.name,
        "folder": shp_path.parent.name,
        "status": None,
        "feature_count": 0,
        "crs_original": None,
        "columns": [],
        "error": None,
    }

    try:
        gdf = gpd.read_file(shp_path)

        result["crs_original"] = str(gdf.crs)
        result["feature_count"] = len(gdf)
        result["columns"] = [c for c in gdf.columns if c != "geometry"]

        # Reproject to WGS84 if needed
        if gdf.crs is None:
            # Assume PRS92 (Philippine standard) if no CRS defined
            gdf = gdf.set_crs("EPSG:4683")
            result["crs_original"] = "EPSG:4683 (assumed PRS92 — no CRS in file)"

        gdf = gdf.to_crs(TARGET_CRS)

        # Use barangay folder name as output filename (cleaner than shp filename)
        barangay_name = shp_path.parent.name.replace(" Shape Files", "").replace(" Shape File", "").replace(" Shape Fles", "").replace(" Shape file", "").strip()
        
        # Tag each feature with its barangay name before saving
        gdf["Barangay"] = barangay_name

        out_path = output_dir / f"{barangay_name}.geojson"

        gdf.to_file(out_path, driver="GeoJSON")

        result["status"] = "OK"
        result["output"] = str(out_path)

        return result, gdf

    except Exception as e:
        result["status"] = "ERROR"
        result["error"] = str(e)
        return result, None


def main():
    print("=" * 60)
    print("  Boac Cadastral Shapefile → GeoJSON Converter")
    print("=" * 60)

    if not INPUT_ROOT.exists():
        print(f"\n[ERROR] Input folder not found:\n  {INPUT_ROOT}")
        print("\nPlease edit INPUT_ROOT in the script to point to your GIS folder.")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    shapefiles = find_shapefiles(INPUT_ROOT)

    if not shapefiles:
        print(f"\n[ERROR] No .shp files found under:\n  {INPUT_ROOT}")
        sys.exit(1)

    print(f"\nFound {len(shapefiles)} shapefile(s). Starting conversion...\n")

    results = []
    merged_gdfs = []

    for i, shp in enumerate(shapefiles, 1):
        print(f"[{i:02d}/{len(shapefiles)}] {shp.parent.name} / {shp.name} ... ", end="", flush=True)

        result, gdf = convert_shapefile(shp, OUTPUT_DIR)
        results.append(result)

        if result["status"] == "OK":
            print(f"OK  ({result['feature_count']} lots)")
            if gdf is not None and MERGE_ALL:
                merged_gdfs.append(gdf)
        else:
            print(f"FAILED")
            print(f"         → {result['error']}")

    # ── Merge all into one GeoJSON ──
    if MERGE_ALL and merged_gdfs:
        print("\nMerging all barangays into boac_all.geojson ...")
        try:
            merged = gpd.GeoDataFrame(pd.concat(merged_gdfs, ignore_index=True), crs=TARGET_CRS)
            merged_path = OUTPUT_DIR / "boac_all.geojson"
            merged.to_file(merged_path, driver="GeoJSON")
            total_lots = len(merged)
            print(f"Merged: {total_lots} total cadastral lots → {merged_path}")
        except Exception as e:
            print(f"Merge failed: {e}")

    # ── Write report ──
    report_path = Path("output/conversion_report.txt")
    report_path.parent.mkdir(parents=True, exist_ok=True)

    ok = [r for r in results if r["status"] == "OK"]
    failed = [r for r in results if r["status"] == "ERROR"]

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"Conversion Report — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Total shapefiles found : {len(results)}\n")
        f.write(f"Successfully converted : {len(ok)}\n")
        f.write(f"Failed                 : {len(failed)}\n\n")

        f.write("─" * 60 + "\n")
        f.write("SUCCESSFUL CONVERSIONS\n")
        f.write("─" * 60 + "\n")
        for r in ok:
            f.write(f"\n[{r['folder']}]\n")
            f.write(f"  Lots      : {r['feature_count']}\n")
            f.write(f"  CRS orig  : {r['crs_original']}\n")
            f.write(f"  Columns   : {', '.join(r['columns'])}\n")

        if failed:
            f.write("\n" + "─" * 60 + "\n")
            f.write("FAILED\n")
            f.write("─" * 60 + "\n")
            for r in failed:
                f.write(f"\n[{r['folder']}] {r['file']}\n")
                f.write(f"  Error: {r['error']}\n")

    # ── Summary ──
    print("\n" + "=" * 60)
    print(f"  Done! {len(ok)}/{len(results)} converted successfully.")
    if failed:
        print(f"  {len(failed)} failed — check output/conversion_report.txt")
    print(f"  GeoJSON files saved to: {OUTPUT_DIR.resolve()}")
    print(f"  Report saved to       : {report_path.resolve()}")
    print("=" * 60)


if __name__ == "__main__":
    main()