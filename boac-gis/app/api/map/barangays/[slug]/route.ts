import { apiJson, requireApiSession, unauthorized } from "@/lib/api-response";
import { readSanitizedBarangayGeometry } from "@/lib/map-data";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const startedAt = Date.now();
  const route = "/api/map/barangays/[slug]";
  if (!(await requireApiSession())) return unauthorized(route, startedAt);
  const { slug } = await params;
  const result = await readSanitizedBarangayGeometry(slug);
  if (!result) return apiJson(route, startedAt, { error: "Barangay not found" }, { status: 404 });
  const version = result.version;
  const etag = `\"${version}-${result.entry.slug}\"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } });
  }
  return new Response(result.serialized, {
    status: 200,
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      ETag: etag,
      "X-Dataset-Version": version,
    },
  });
}
