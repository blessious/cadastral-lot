import { apiJson, requireApiSession, unauthorized } from "@/lib/api-response";
import { findLotDetails, getDatasetVersion } from "@/lib/map-data";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const route = "/api/map/lots/[id]";
  if (!(await requireApiSession())) return unauthorized(route, startedAt);
  const { id } = await params;
  const lot = await findLotDetails(decodeURIComponent(id));
  if (!lot) return apiJson(route, startedAt, { error: "Lot not found" }, { status: 404 });
  return apiJson(route, startedAt, { version: await getDatasetVersion(), lot }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
