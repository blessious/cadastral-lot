import { NextResponse } from "next/server";

import { getMySqlPool } from "@/lib/db";
import { getDatasetVersion, getSearchTableSummary, verifyGeometryFiles } from "@/lib/map-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const target = new URL(request.url).searchParams.get("target") === "staged" ? "staged" : "active";
  try {
    const [version, geometry, pool, search] = await Promise.all([
      getDatasetVersion(), verifyGeometryFiles(), getMySqlPool(), getSearchTableSummary(target),
    ]);
    await pool.query("SELECT 1");
    const versionAgreement = search.available && search.versionConsistent && search.version === version;
    const status = geometry.ready && versionAgreement ? "ok" : "degraded";
    return NextResponse.json({
      status,
      target,
      release: { commit: process.env.RELEASE_COMMIT ?? process.env.GIT_COMMIT ?? "development" },
      database: { ready: true },
      geometry,
      dataset: { publishedVersion: version, targetVersion: search.version, searchRows: search.rowCount, versionAgreement },
      durationMs: Date.now() - startedAt,
    }, {
      status: status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Health check failed", error);
    return NextResponse.json({ status: "degraded", target, release: { commit: process.env.RELEASE_COMMIT ?? "development" }, database: { ready: false }, geometry: { ready: false }, dataset: { versionAgreement: false } }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
