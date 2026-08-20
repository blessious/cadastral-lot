import { apiJson, requireApiSession, unauthorized } from "@/lib/api-response";
import { getBarangays, getDatasetVersion } from "@/lib/map-data";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const route = "/api/map/barangays";
  if (!(await requireApiSession())) return unauthorized(route, startedAt);
  const [barangays, version] = await Promise.all([getBarangays(), getDatasetVersion()]);
  return apiJson(route, startedAt, { version, barangays }, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" },
  });
}
