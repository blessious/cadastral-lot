import { NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/current-session";

export async function requireApiSession() {
  const session = await getCurrentSession();
  return session ?? null;
}

export function apiJson(
  route: string,
  startedAt: number,
  body: unknown,
  init: ResponseInit = {},
) {
  const serialized = JSON.stringify(body);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  const response = new NextResponse(serialized, { ...init, headers });
  const durationMs = Date.now() - startedAt;
  const status = init.status ?? 200;
  const size = Buffer.byteLength(serialized);
  const datasetVersion = headers.get("X-Dataset-Version")
    ?? (body && typeof body === "object" && "version" in body ? String((body as { version?: unknown }).version ?? "") : undefined);
  console.info(JSON.stringify({ route, status, durationMs, responseBytes: size, datasetVersion }));
  return response;
}

export function unauthorized(route: string, startedAt: number) {
  return apiJson(route, startedAt, { error: "Authentication required" }, {
    status: 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}
