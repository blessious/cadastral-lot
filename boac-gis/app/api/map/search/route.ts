import { headers } from "next/headers";

import { apiJson, requireApiSession, unauthorized } from "@/lib/api-response";
import { getDatasetVersion, searchLots } from "@/lib/map-data";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const route = "/api/map/search";
  const session = await requireApiSession();
  if (!session) return unauthorized(route, startedAt);

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2) return apiJson(route, startedAt, { error: "Enter at least 2 characters" }, { status: 400 });
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const barangays = url.searchParams.getAll("barangay").flatMap((value) => value.split(","));
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = consumeRateLimit(`${address}:${session.sub}:search`, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return apiJson(route, startedAt, { error: "Too many searches" }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "private, no-store" },
    });
  }

  const [results, version] = await Promise.all([searchLots(query, barangays, limit), getDatasetVersion()]);
  return apiJson(route, startedAt, { version, results }, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
