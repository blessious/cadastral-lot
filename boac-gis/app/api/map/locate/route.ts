import { booleanPointInPolygon, point } from "@turf/turf";
import type { Feature, GeoJsonProperties, Polygon, MultiPolygon } from "geojson";

import { apiJson, requireApiSession, unauthorized } from "@/lib/api-response";
import { getBarangays, readBarangayGeometry } from "@/lib/map-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const route = "/api/map/locate";
  if (!(await requireApiSession())) return unauthorized(route, startedAt);
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return apiJson(route, startedAt, { error: "Valid lat and lng are required" }, { status: 400 });
  }

  const candidates = (await getBarangays()).filter(({ bbox }) =>
    lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]);
  const target = point([lng, lat]);
  for (const candidate of candidates) {
    const geometry = await readBarangayGeometry(candidate.slug);
    const lotIndex = geometry?.data.features.findIndex((feature) => {
      if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") return false;
      return booleanPointInPolygon(target, feature as Feature<Polygon | MultiPolygon, GeoJsonProperties>);
    }) ?? -1;
    if (lotIndex >= 0 && geometry) {
      const feature = geometry.data.features[lotIndex];
      const lot = {
        ...feature,
        properties: {
          __uid: feature.properties?.__uid ?? `${candidate.file}-${lotIndex}`,
          CLN: feature.properties?.CLN,
          PIN: feature.properties?.PIN,
          Barangay: feature.properties?.Barangay ?? candidate.name,
          Land_Class: feature.properties?.Land_Class ?? feature.properties?.LAND_CLASS,
        },
      };
      return apiJson(route, startedAt, { barangay: candidate, lot }, { headers: { "Cache-Control": "private, max-age=60" } });
    }
  }
  return apiJson(route, startedAt, { barangay: candidates[0] ?? null, lot: null }, { headers: { "Cache-Control": "private, max-age=60" } });
}
