"""
merge_apitong_geometry.py
--------------------------
Merges the ETRACS-enriched Apitong.geojson (has Owner/TaxDecNo but geometry: null)
with the original shapefile Apitong.geojson (has geometry but no Owner).

Matching priority: PIN first, then CLN.
Output is written directly to public/geojson/Apitong.geojson.
"""

import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
GEO_SOURCE_COMMIT = "99bab9e"  # the commit that had the valid shapefile geometry
ETRACS_FILE = PROJECT_ROOT / "output" / "geojson" / "Apitong.geojson"
OUT_FILE    = PROJECT_ROOT / "boac-gis" / "public" / "geojson" / "Apitong.geojson"

def get_geometry_from_git(commit: str) -> tuple[dict, dict]:
    """Extract geometry lookup tables (by PIN and CLN) from a git commit."""
    result = subprocess.run(
        ["git", "show", f"{commit}:boac-gis/public/geojson/Apitong.geojson"],
        capture_output=True, text=True,
        cwd=PROJECT_ROOT
    )
    if result.returncode != 0:
        print(f"[ERROR] Could not read from git: {result.stderr}")
        sys.exit(1)

    data = json.loads(result.stdout)
    pin_geo = {}
    cln_geo = {}
    for f in data["features"]:
        geo = f.get("geometry")
        if not geo:
            continue
        props = f.get("properties") or {}
        pin = str(props.get("PIN") or "").strip()
        cln = str(props.get("CLN") or "").strip()
        if pin:
            pin_geo[pin] = geo
        if cln:
            cln_geo[cln] = geo

    print(f"[OK] Loaded {len(pin_geo)} PIN geometries, {len(cln_geo)} CLN geometries from git:{commit}")
    return pin_geo, cln_geo


def main():
    # Load the ETRACS-enriched file (has Owner/TaxDecNo but geometry: null)
    with open(ETRACS_FILE, "r", encoding="utf-8", errors="replace") as f:
        etracs_data = json.load(f)

    pin_geo, cln_geo = get_geometry_from_git(GEO_SOURCE_COMMIT)

    features = etracs_data.get("features", [])
    matched = 0
    unmatched = []

    for feature in features:
        props = feature.get("properties") or {}
        pin = str(props.get("PIN") or "").strip()
        cln = str(props.get("CLN") or "").strip()

        geo = pin_geo.get(pin) or cln_geo.get(cln)
        if geo:
            feature["geometry"] = geo
            matched += 1
        else:
            unmatched.append(cln or pin or "??")

    print(f"\n[RESULT] {matched}/{len(features)} features got geometry injected.")
    if unmatched:
        print(f"[WARN] {len(unmatched)} features could NOT be matched (no geometry):")
        for u in unmatched[:10]:
            print(f"  - CLN/PIN: {u}")
        if len(unmatched) > 10:
            print(f"  ... and {len(unmatched) - 10} more")

    # Write merged output
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(etracs_data, f, separators=(",", ":"), ensure_ascii=False)

    print(f"\n[DONE] Written to: {OUT_FILE}")


if __name__ == "__main__":
    main()
