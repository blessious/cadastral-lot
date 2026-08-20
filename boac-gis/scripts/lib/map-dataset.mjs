import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ");
}

function safeGeoJsonFilename(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(new URL(value, "http://local").pathname);
  } catch {
    return null;
  }
  const filename = path.basename(decoded);
  if (!filename.toLowerCase().endsWith(".geojson")) return null;
  return filename;
}

export async function getDatasetVersion(dataDir) {
  const geometryFiles = (await fs.readdir(dataDir))
    .filter((name) => name.toLowerCase().endsWith(".geojson") && name.toLowerCase() !== "boac_all.geojson")
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  const files = ["index.json", "search_index.json", ...geometryFiles];
  const digest = createHash("sha256");
  for (const name of files) {
    const contents = await fs.readFile(path.join(dataDir, name));
    digest.update(`${Buffer.byteLength(name)}:${name}:${contents.length}:`).update(contents);
  }
  return digest.digest("hex").slice(0, 16);
}

export async function loadAndValidateDataset(dataDir) {
  const [indexText, searchText, version] = await Promise.all([
    fs.readFile(path.join(dataDir, "index.json"), "utf8"),
    fs.readFile(path.join(dataDir, "search_index.json"), "utf8"),
    getDatasetVersion(dataDir),
  ]);
  const barangays = JSON.parse(indexText);
  const records = JSON.parse(searchText);

  if (!Array.isArray(barangays) || barangays.length === 0) {
    throw new Error("index.json must contain at least one barangay");
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("search_index.json must contain at least one lot");
  }

  const indexedFiles = new Set();
  const geometryFiles = new Map();
  let indexedLotCount = 0;
  for (const [index, barangay] of barangays.entries()) {
    if (!barangay || typeof barangay.name !== "string" || typeof barangay.file !== "string") {
      throw new Error(`Barangay index row ${index + 1} is invalid`);
    }
    if (!Array.isArray(barangay.bbox) || barangay.bbox.length !== 4 || !barangay.bbox.every(Number.isFinite)) {
      throw new Error(`Barangay '${barangay.name}' has an invalid bounding box`);
    }
    const filename = safeGeoJsonFilename(barangay.file);
    if (!filename) throw new Error(`Barangay '${barangay.name}' has an unsafe geometry filename`);
    indexedFiles.add(barangay.file);
    geometryFiles.set(barangay.file, filename);
    indexedLotCount += Number.isFinite(Number(barangay.lot_count)) ? Number(barangay.lot_count) : 0;
  }

  const ids = new Set();
  const referencedFiles = new Set();
  const unindexedFiles = new Set();
  const expectedIdsByFile = new Map();
  for (const [index, record] of records.entries()) {
    const id = String(record?.__uid ?? "").trim();
    if (!id) throw new Error(`Search row ${index + 1} has no stable __uid`);
    if (ids.has(id)) throw new Error(`Duplicate stable lot ID: ${id}`);
    ids.add(id);

    const filename = safeGeoJsonFilename(record?.file);
    if (!filename) throw new Error(`Search row ${index + 1} has an unsafe source file`);
    referencedFiles.add(record.file);
    geometryFiles.set(record.file, filename);
    if (!indexedFiles.has(record.file)) unindexedFiles.add(record.file);
    const expectedIds = expectedIdsByFile.get(record.file) ?? new Set();
    expectedIds.add(id);
    expectedIdsByFile.set(record.file, expectedIds);
  }

  const geometryResults = await Promise.all([...geometryFiles].map(async ([sourceFile, filename]) => {
    let collection;
    try {
      collection = JSON.parse(await fs.readFile(path.join(dataDir, filename), "utf8"));
    } catch (error) {
      throw new Error(`Geometry file '${sourceFile}' cannot be read as JSON: ${error?.message ?? error}`);
    }
    if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
      throw new Error(`Geometry file '${sourceFile}' is not a GeoJSON FeatureCollection`);
    }
    const geometryIds = new Map();
    for (const [featureIndex, feature] of collection.features.entries()) {
      if (feature?.type !== "Feature" || !(feature.geometry === null || typeof feature.geometry === "object")) {
        throw new Error(`Geometry file '${sourceFile}' has an invalid feature at row ${featureIndex + 1}`);
      }
      geometryIds.set(String(feature.properties?.__uid ?? `${sourceFile}-${featureIndex}`), feature.geometry !== null);
    }
    let searchRowsWithoutGeometry = 0;
    for (const expectedId of expectedIdsByFile.get(sourceFile) ?? []) {
      if (!geometryIds.has(expectedId)) {
        throw new Error(`Search lot '${expectedId}' is missing from geometry file '${sourceFile}'`);
      }
      if (!geometryIds.get(expectedId)) searchRowsWithoutGeometry += 1;
    }
    return { featureCount: collection.features.length, searchRowsWithoutGeometry };
  }));
  const geometryFeatureCount = geometryResults.reduce((total, result) => total + result.featureCount, 0);
  const searchRowsWithoutGeometry = geometryResults.reduce((total, result) => total + result.searchRowsWithoutGeometry, 0);

  return {
    version,
    barangays,
    records,
    diagnostics: {
      barangayCount: barangays.length,
      searchRowCount: records.length,
      stableIdCount: ids.size,
      indexedLotCount,
      referencedFileCount: referencedFiles.size,
      validatedGeometryFiles: geometryFiles.size,
      geometryFeatureCount,
      searchRowsWithoutGeometry,
      unindexedFiles: [...unindexedFiles].sort(),
      lotCountDifference: records.length - indexedLotCount,
    },
  };
}

export function toSearchValues(record, datasetVersion) {
  const landClass = record.Land_Class ?? record.LAND_CLASS ?? null;
  return [
    String(record.__uid),
    datasetVersion,
    record.CLN || null,
    record.ALN || null,
    record.PIN || null,
    record.Barangay || null,
    record.Section || null,
    landClass || null,
    record.Area == null ? null : String(record.Area),
    record.Owner || null,
    record.TaxDecNo || null,
    record.file,
    normalizeSearchText(record.CLN),
    normalizeSearchText(record.ALN),
    normalizeSearchText(record.PIN),
    normalizeSearchText(record.Barangay),
    normalizeSearchText(record.Owner),
    normalizeSearchText(record.TaxDecNo),
    normalizeSearchText(record.file),
  ];
}
