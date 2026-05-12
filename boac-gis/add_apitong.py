import json
import os

geojson_path = "public/geojson/Apitong.geojson"
index_path = "public/geojson/index.json"

with open(geojson_path, "r", encoding="utf-8") as f:
    data = json.load(f)

min_lon, min_lat = float("inf"), float("inf")
max_lon, max_lat = float("-inf"), float("-inf")

for feature in data.get("features", []):
    geom = feature.get("geometry")
    if not geom: continue
    coords = geom.get("coordinates", [])
    
    def flatten(c):
        for item in c:
            if isinstance(item[0], (int, float)):
                yield item
            else:
                yield from flatten(item)
                
    for lon, lat in flatten(coords):
        min_lon = min(min_lon, lon)
        min_lat = min(min_lat, lat)
        max_lon = max(max_lon, lon)
        max_lat = max(max_lat, lat)

entry = {
    "name": "Apitong",
    "file": "/geojson/Apitong.geojson",
    "bbox": [min_lon, min_lat, max_lon, max_lat],
    "lot_count": len(data.get("features", []))
}

with open(index_path, "r", encoding="utf-8") as f:
    index_data = json.load(f)

# check if it already exists
if not any(x["name"] == "Apitong" for x in index_data):
    index_data.append(entry)
    index_data.sort(key=lambda x: x["name"])
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2)
    print("Added Apitong to index.json")
else:
    print("Apitong already in index.json")
