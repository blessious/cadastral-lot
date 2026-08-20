import { apiJson, requireApiSession, unauthorized } from "@/lib/api-response";
import { getDatasetVersion } from "@/lib/map-data";

export async function GET() {
  const startedAt = Date.now();
  const route = "/api/map/version";
  if (!(await requireApiSession())) return unauthorized(route, startedAt);
  return apiJson(route, startedAt, { version: await getDatasetVersion() }, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
