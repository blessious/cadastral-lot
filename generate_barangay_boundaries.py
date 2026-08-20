"""Generate lightweight, display-only barangay envelopes from parcel GeoJSON.

Coordinates are copied as-is from the published EPSG:4326 parcel files. The
convex hulls are an overview aid only; authoritative parcel geometry is kept in
the original per-barangay files and is never rewritten by this script.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterator


PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "boac-gis" / "public" / "geojson"
INDEX_FILE = DATA_DIR / "index.json"
OUTPUT_FILE = DATA_DIR / "barangay_boundaries.geojson"


def iter_points(value: object) -> Iterator[tuple[float, float]]:
    if not isinstance(value, list):
        return
    if len(value) >= 2 and all(isinstance(part, (int, float)) for part in value[:2]):
        x, y = float(value[0]), float(value[1])
        if math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90:
            yield x, y
        return
    for child in value:
        yield from iter_points(child)


def convex_hull(points: set[tuple[float, float]]) -> list[tuple[float, float]]:
    ordered = sorted(points)
    if len(ordered) <= 1:
        return ordered

    def cross(origin: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
        return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])

    lower: list[tuple[float, float]] = []
    for point in ordered:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper: list[tuple[float, float]] = []
    for point in reversed(ordered):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def bbox_ring(bbox: list[float]) -> list[list[float]]:
    west, south, east, north = bbox
    return [[west, south], [east, south], [east, north], [west, north], [west, south]]


def main() -> None:
    entries = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    features: list[dict[str, object]] = []
    for entry in entries:
        source = DATA_DIR / Path(entry["file"]).name
        points: set[tuple[float, float]] = set()
        if source.exists():
            data = json.loads(source.read_text(encoding="utf-8"))
            for feature in data.get("features", []):
                geometry = feature.get("geometry") or {}
                points.update(iter_points(geometry.get("coordinates")))
        hull = convex_hull(points)
        ring = [[x, y] for x, y in hull]
        if len(ring) >= 3:
            ring.append(ring[0])
            source_kind = "parcel-convex-hull"
        else:
            ring = bbox_ring(entry["bbox"])
            source_kind = "bbox-fallback"
        features.append({
            "type": "Feature",
            "properties": {"name": entry["name"], "file": entry["file"], "derived": source_kind},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })

    OUTPUT_FILE.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"[OK] Wrote {len(features)} display boundaries to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
