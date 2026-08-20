import { createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadRuntimeEnv, readOption } from "./lib/runtime-config.mjs";

const args = process.argv.slice(2);
const baseUrl = readOption(args, "--base-url", "http://127.0.0.1:3005").replace(/\/$/, "");
const target = readOption(args, "--target", "active");
const expectedVersion = readOption(args, "--expected-version");
const expectedCommit = readOption(args, "--expected-commit");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(scriptDirectory, "..", "public", "geojson");
const env = await loadRuntimeEnv();
if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET is required for release verification");

function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({ sub: "deployment-smoke", username: "deployment-smoke", role: "viewer", iat: now, exp: now + 300 })).toString("base64url");
  const signature = createHmac("sha256", env.AUTH_SECRET).update(encoded).digest("base64url");
  return `boac_gis_session=${encoded}.${signature}`;
}

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

const health = await json(`${baseUrl}/api/health?target=${target}`, { headers: { "Cache-Control": "no-cache" } });
if (!health.response.ok || health.body?.status !== "ok") throw new Error(`Health verification failed: ${health.response.status} ${JSON.stringify(health.body)}`);
if (expectedVersion && (health.body.dataset?.publishedVersion !== expectedVersion || health.body.dataset?.targetVersion !== expectedVersion)) throw new Error("Health dataset version mismatch");
if (expectedCommit && health.body.release?.commit !== expectedCommit) throw new Error("Health release commit mismatch");

const unauthorized = await fetch(`${baseUrl}/api/map/search?q=test`, { redirect: "manual" });
if (unauthorized.status !== 401) throw new Error(`Protected API returned ${unauthorized.status}, expected 401`);

const cookie = sessionCookie();
const barangays = await json(`${baseUrl}/api/map/barangays`, { headers: { Cookie: cookie } });
if (!barangays.response.ok || !Array.isArray(barangays.body?.barangays) || !barangays.body.barangays.length) throw new Error("Authenticated barangay API failed");
const first = barangays.body.barangays[0];
const geometry = await fetch(`${baseUrl}/api/map/barangays/${encodeURIComponent(first.slug)}`, { headers: { Cookie: cookie } });
if (!geometry.ok || !geometry.headers.get("etag") || geometry.headers.get("cache-control")?.includes("public")) throw new Error("Geometry cache contract failed");
if (geometry.headers.get("x-dataset-version") !== health.body.dataset.publishedVersion) throw new Error("Geometry dataset version mismatch");
const geometryBody = await geometry.json();
if (geometryBody?.type !== "FeatureCollection" || !Array.isArray(geometryBody.features)) throw new Error("Geometry API did not return a FeatureCollection");
const allowedGeometryProperties = new Set(["__uid", "CLN", "PIN", "Barangay", "Land_Class"]);
for (const feature of geometryBody.features) {
  for (const key of Object.keys(feature?.properties ?? {})) {
    if (!allowedGeometryProperties.has(key)) throw new Error(`Geometry API exposed unexpected property '${key}'`);
  }
}
const conditional = await fetch(`${baseUrl}/api/map/barangays/${encodeURIComponent(first.slug)}`, { headers: { Cookie: cookie, "If-None-Match": geometry.headers.get("etag") } });
if (conditional.status !== 304) throw new Error(`Conditional geometry request returned ${conditional.status}, expected 304`);

if (target === "active") {
  const index = JSON.parse(await fs.readFile(path.join(dataDirectory, "search_index.json"), "utf8"));
  const sample = index.find((row) => String(row.CLN ?? row.PIN ?? "").trim().length >= 4);
  const ownerSample = index.find((row) => {
    const owner = String(row.Owner ?? "").trim();
    return owner.length >= 3 && owner.length <= 120;
  });
  if (!sample || !ownerSample) throw new Error("Search index has no suitable verification samples");
  const exactQuery = String(sample.CLN ?? sample.PIN).trim();
  const prefixQuery = exactQuery.slice(0, Math.max(2, Math.min(4, exactQuery.length - 1)));
  const ownerQuery = String(ownerSample.Owner).trim();
  const secondFile = index.find((row) => row.file && row.file !== sample.file)?.file;
  const scenarios = [
    { name: "exact identifier", query: exactQuery, files: [], expectResults: true },
    { name: "identifier prefix", query: prefixQuery, files: [], expectResults: true },
    { name: "owner", query: ownerQuery, files: [], expectResults: true },
    { name: "no result", query: `no-such-lot-${Date.now()}`, files: [], expectResults: false },
    { name: "single barangay", query: exactQuery, files: [sample.file], expectResults: true },
    { name: "multiple barangays", query: prefixQuery, files: [sample.file, secondFile].filter(Boolean), expectResults: true },
  ];
  const durations = [];
  for (const scenario of scenarios) {
    for (let repetition = 0; repetition < 3; repetition += 1) {
      const parameters = new URLSearchParams({ q: scenario.query, limit: "10" });
      for (const file of scenario.files) parameters.append("barangay", file);
      const started = performance.now();
      const result = await json(`${baseUrl}/api/map/search?${parameters}`, { headers: { Cookie: cookie, "Cache-Control": "no-cache" } });
      durations.push(performance.now() - started);
      if (!result.response.ok || !Array.isArray(result.body?.results)) throw new Error(`Search scenario '${scenario.name}' failed`);
      if (scenario.expectResults && !result.body.results.length) throw new Error(`Search scenario '${scenario.name}' returned no results`);
      if (!scenario.expectResults && result.body.results.length) throw new Error(`Search scenario '${scenario.name}' unexpectedly returned results`);
      if (scenario.files.length && result.body.results.some((row) => !scenario.files.includes(row.file))) {
        throw new Error(`Search scenario '${scenario.name}' escaped its barangay filter`);
      }
    }
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  if (p95 > 500) throw new Error(`Search p95 ${p95.toFixed(1)}ms exceeds 500ms`);
  console.log(JSON.stringify({ status: "ok", target, searchP95Ms: Number(p95.toFixed(1)), version: health.body.dataset.publishedVersion }));
} else {
  console.log(JSON.stringify({ status: "ok", target, version: health.body.dataset.publishedVersion }));
}
