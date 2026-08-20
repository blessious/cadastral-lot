import "server-only";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { FeatureCollection, GeoJsonProperties } from "geojson";
import type { RowDataPacket } from "mysql2";

import { getMySqlPool } from "@/lib/db";

export type BarangayEntry = {
  name: string;
  slug: string;
  file: string;
  bbox: [number, number, number, number];
  lot_count: number;
};

export type MapSearchRecord = {
  CLN?: string; ALN?: string; PIN?: string; Barangay?: string; Section?: string;
  Land_Class?: string; LAND_CLASS?: string; Area?: string; Owner?: string;
  TaxDecNo?: string; __uid?: string; file: string;
};

type SearchRow = RowDataPacket & {
  id: string; cln: string | null; aln: string | null; pin: string | null;
  barangay: string | null; section_name: string | null; land_class: string | null;
  area: string | null; owner_name: string | null; tax_dec_no: string | null;
  source_file: string;
};

type GeometryCacheEntry = {
  entry: BarangayEntry;
  data: FeatureCollection;
  sanitized: string;
  version: string;
  bytes: number;
};

const DATA_DIR = path.join(process.cwd(), "public", "geojson");
const GEOMETRY_CACHE_LIMIT = 12;
const GEOMETRY_CACHE_BYTES = 32 * 1024 * 1024;
let barangayPromise: Promise<BarangayEntry[]> | null = null;
let fallbackSearchPromise: Promise<MapSearchRecord[]> | null = null;
let versionPromise: Promise<string> | null = null;
const geometryCache = new Map<string, GeometryCacheEntry>();
const geometryLoads = new Map<string, Promise<GeometryCacheEntry | null>>();
let geometryCacheBytes = 0;

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function escapeLike(value: string) {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

export function getBarangays() {
  barangayPromise ??= readJson<Omit<BarangayEntry, "slug">[]>(path.join(DATA_DIR, "index.json"))
    .then((rows) => rows.map((row) => ({ ...row, slug: slugify(row.name) })))
    .catch((error) => { barangayPromise = null; throw error; });
  return barangayPromise;
}

export function getFallbackSearchRecords() {
  fallbackSearchPromise ??= readJson<MapSearchRecord[]>(path.join(DATA_DIR, "search_index.json"))
    .catch((error) => { fallbackSearchPromise = null; throw error; });
  return fallbackSearchPromise;
}

export function getDatasetVersion() {
  versionPromise ??= (async () => {
    const geometryFiles = (await fs.readdir(DATA_DIR))
      .filter((name) => name.toLowerCase().endsWith(".geojson") && name.toLowerCase() !== "boac_all.geojson")
      .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
    const files = ["index.json", "search_index.json", ...geometryFiles];
    const digest = createHash("sha256");
    for (const name of files) {
      const contents = await fs.readFile(path.join(DATA_DIR, name));
      digest.update(`${Buffer.byteLength(name)}:${name}:${contents.length}:`).update(contents);
    }
    return digest.digest("hex").slice(0, 16);
  })().catch((error) => { versionPromise = null; throw error; });
  return versionPromise;
}

export async function findBarangay(slug: string) {
  return (await getBarangays()).find((entry) => entry.slug === slug) ?? null;
}

function geometryFilename(entry: BarangayEntry) {
  const filename = path.basename(decodeURIComponent(new URL(entry.file, "http://local").pathname));
  if (!filename.toLowerCase().endsWith(".geojson")) throw new Error("Unsafe geometry filename");
  return filename;
}

function touchGeometryCache(slug: string, value: GeometryCacheEntry) {
  const existing = geometryCache.get(slug);
  if (existing) geometryCacheBytes -= existing.bytes;
  geometryCache.delete(slug);
  geometryCache.set(slug, value);
  geometryCacheBytes += value.bytes;
  while (geometryCache.size > GEOMETRY_CACHE_LIMIT || geometryCacheBytes > GEOMETRY_CACHE_BYTES) {
    const oldest = geometryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    geometryCacheBytes -= geometryCache.get(oldest)?.bytes ?? 0;
    geometryCache.delete(oldest);
  }
}

async function loadGeometry(slug: string): Promise<GeometryCacheEntry | null> {
  const version = await getDatasetVersion();
  const cached = geometryCache.get(slug);
  if (cached?.version === version) {
    touchGeometryCache(slug, cached);
    return cached;
  }
  const loadKey = `${version}:${slug}`;
  const pending = geometryLoads.get(loadKey);
  if (pending) return pending;

  const load = (async () => {
    const entry = await findBarangay(slug);
    if (!entry) return null;
    const data = await readJson<FeatureCollection>(path.join(DATA_DIR, geometryFilename(entry)));
    const sanitizedData: FeatureCollection = {
      type: "FeatureCollection",
      features: data.features.map((feature, index) => ({
        type: "Feature",
        ...(feature.id == null ? {} : { id: feature.id }),
        geometry: feature.geometry,
        properties: {
          __uid: feature.properties?.__uid ?? `${entry.file}-${index}`,
          CLN: feature.properties?.CLN,
          PIN: feature.properties?.PIN,
          Barangay: feature.properties?.Barangay ?? entry.name,
          Land_Class: feature.properties?.Land_Class ?? feature.properties?.LAND_CLASS,
        },
      })),
    };
    const sanitized = JSON.stringify(sanitizedData);
    const value = { entry, data, sanitized, version, bytes: Buffer.byteLength(sanitized) };
    touchGeometryCache(slug, value);
    return value;
  })().finally(() => geometryLoads.delete(loadKey));
  geometryLoads.set(loadKey, load);
  return load;
}

export async function readBarangayGeometry(slug: string) {
  const value = await loadGeometry(slug);
  return value ? { entry: value.entry, data: value.data } : null;
}

export async function readSanitizedBarangayGeometry(slug: string) {
  const value = await loadGeometry(slug);
  return value ? { entry: value.entry, serialized: value.sanitized, version: value.version } : null;
}

function rowToRecord(row: SearchRow): MapSearchRecord {
  return { __uid: row.id, CLN: row.cln ?? undefined, ALN: row.aln ?? undefined,
    PIN: row.pin ?? undefined, Barangay: row.barangay ?? undefined,
    Section: row.section_name ?? undefined, Land_Class: row.land_class ?? undefined,
    Area: row.area ?? undefined, Owner: row.owner_name ?? undefined,
    TaxDecNo: row.tax_dec_no ?? undefined, file: row.source_file };
}

function tableForTarget(target: "active" | "staged") {
  return target === "staged" ? "cadastral_lot_search_staging" : "cadastral_lot_search";
}

async function databaseSearch(query: string, barangays: string[], limit: number) {
  const pool = await getMySqlPool();
  const needle = normalize(query);
  const escapedNeedle = escapeLike(needle);
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit) || 50));
  const files = Array.from(new Set(barangays.map(normalize).filter(Boolean))).slice(0, 100);
  const fileClause = files.length ? `source_file_norm IN (${files.map(() => "?").join(",")}) AND ` : "";
  const columns = "id, cln, aln, pin, barangay, section_name, land_class, area, owner_name, tax_dec_no, source_file";
  const exactColumns = ["cln_norm", "aln_norm", "pin_norm", "tax_dec_norm", "owner_norm", "barangay_norm"];
  const identifierColumns = ["cln_norm", "aln_norm", "pin_norm", "tax_dec_norm"];
  const exactPredicate = exactColumns.map((column) => `${column} = ?`).join(" OR ");
  const prefixPredicate = exactColumns.map((column) => `${column} LIKE ? ESCAPE '!'`).join(" OR ");
  const substringPredicate = exactColumns.map((column) => `${column} LIKE ? ESCAPE '!'`).join(" OR ");
  const prefix = `${escapedNeedle}%`;
  const exactValues = [...files, ...exactColumns.map(() => needle), ...exactColumns.map(() => prefix)];
  const [primary] = await pool.query<SearchRow[]>(`
    SELECT ${columns} FROM cadastral_lot_search WHERE ${fileClause}
      (${exactPredicate} OR ${prefixPredicate})
    ORDER BY CASE WHEN ${identifierColumns.map((column) => `${column} = ?`).join(" OR ")} THEN 0
                  WHEN ${identifierColumns.map((column) => `${column} LIKE ? ESCAPE '!'`).join(" OR ")} THEN 1
                  WHEN owner_norm = ? THEN 2
                  WHEN owner_norm LIKE ? ESCAPE '!' THEN 3
                  WHEN barangay_norm = ? THEN 4 ELSE 5 END, cln_norm
    LIMIT ${safeLimit}`,
    [...exactValues, ...identifierColumns.map(() => needle), ...identifierColumns.map(() => prefix), needle, prefix, needle],
  );
  if (primary.length >= safeLimit) return primary.map(rowToRecord);

  const excluded = primary.map((row) => row.id);
  const remaining = safeLimit - primary.length;
  const exclusion = excluded.length ? `AND id NOT IN (${excluded.map(() => "?").join(",")})` : "";
  const [secondary] = await pool.query<SearchRow[]>(`
    SELECT ${columns} FROM cadastral_lot_search WHERE ${fileClause}
      (${substringPredicate})
      ${exclusion} ORDER BY cln_norm LIMIT ${remaining}`,
    [...files, ...exactColumns.map(() => `%${escapedNeedle}%`), ...excluded],
  );
  return [...primary, ...secondary].map(rowToRecord);
}

export async function searchLots(query: string, barangays: string[], limit: number) {
  try {
    return await databaseSearch(query, barangays, limit);
  } catch (error) {
    console.warn("Database search unavailable; using the versioned static fallback", error);
  }
  const needle = normalize(query);
  const allowed = new Set(barangays.map(normalize));
  const matches = (await getFallbackSearchRecords()).filter((record) => {
    if (allowed.size && !allowed.has(normalize(record.file))) return false;
    return [record.CLN, record.ALN, record.PIN, record.Owner, record.Barangay].some((value) => normalize(value).includes(needle));
  });
  return matches.slice(0, limit);
}

export async function getSearchTableSummary(target: "active" | "staged" = "active") {
  const table = tableForTarget(target);
  const pool = await getMySqlPool();
  const [exists] = await pool.execute<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1", [table]);
  if (!exists.length) return { available: false, version: null, rowCount: 0, versionConsistent: false };
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) row_count, MIN(dataset_version) min_version, MAX(dataset_version) max_version FROM \`${table}\``);
  const row = rows[0];
  const min = row.min_version == null ? null : String(row.min_version);
  const max = row.max_version == null ? null : String(row.max_version);
  return { available: true, version: min === max ? min : null, rowCount: Number(row.row_count ?? 0), versionConsistent: min === max && min !== null };
}

export async function verifyGeometryFiles() {
  const barangays = await getBarangays();
  await Promise.all(barangays.map((entry) => fs.access(path.join(DATA_DIR, geometryFilename(entry)))));
  return { ready: true, count: barangays.length };
}

export async function findLot(id: string) {
  try {
    const pool = await getMySqlPool();
    const [rows] = await pool.execute<SearchRow[]>(`SELECT id, cln, aln, pin, barangay, section_name, land_class, area, owner_name, tax_dec_no, source_file FROM cadastral_lot_search WHERE id = ? LIMIT 1`, [id]);
    if (rows[0]) return rowToRecord(rows[0]);
  } catch (error) { console.warn("Database lot lookup unavailable; using fallback", error); }
  return (await getFallbackSearchRecords()).find((record) => record.__uid === id) ?? null;
}

export async function findLotDetails(id: string) {
  const indexed = await findLot(id);
  if (!indexed) return null;
  const entry = (await getBarangays()).find((barangay) => barangay.file === indexed.file);
  if (!entry) return { id, properties: indexed as GeoJsonProperties };
  const geometry = await readBarangayGeometry(entry.slug);
  const feature = geometry?.data.features.find((candidate, index) =>
    (candidate.properties?.__uid ?? `${entry.file}-${index}`) === id);
  return { id, properties: feature?.properties ?? indexed as GeoJsonProperties };
}
