import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

import { loadAndValidateDataset, toSearchValues } from "./lib/map-dataset.mjs";
import { getMySqlConfig, loadRuntimeEnv, readOption } from "./lib/runtime-config.mjs";
import {
  acquireNamedLock,
  createSearchTable,
  getAllSearchTableSummaries,
  getTableSummary,
  releaseNamedLock,
  SEARCH_TABLES,
  tableExists,
  updateDatasetState,
} from "./lib/map-schema.mjs";

const command = process.argv[2];
const args = process.argv.slice(3);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(scriptDirectory, "..", "public", "geojson");
const expectedVersion = readOption(args, "--expected-version");
const supported = new Set(["stage", "activate", "rollback", "status"]);
if (!supported.has(command)) {
  throw new Error("Usage: map-data-lifecycle.mjs <stage|activate|rollback|status> [--expected-version VERSION]");
}

const config = getMySqlConfig(await loadRuntimeEnv());
const connection = await mysql.createConnection(config);
let lockHeld = false;

function assertExpectedVersion(actual) {
  if (expectedVersion && expectedVersion !== actual) {
    throw new Error(`Dataset version '${actual}' does not match expected version '${expectedVersion}'`);
  }
}

async function assertMigrationsApplied() {
  const [rows] = await connection.query(
    "SELECT version FROM gis_schema_migrations WHERE version = '001' LIMIT 1",
  );
  if (!rows.length) throw new Error("Database migrations are not current. Run `npm run db:migrate` first.");
}

async function stageDataset() {
  await assertMigrationsApplied();
  const dataset = await loadAndValidateDataset(dataDirectory);
  assertExpectedVersion(dataset.version);

  await connection.query(`DROP TABLE IF EXISTS \`${SEARCH_TABLES.staged}\``);
  await createSearchTable(connection, SEARCH_TABLES.staged);
  await connection.beginTransaction();
  try {
    const columns = `(id, dataset_version, cln, aln, pin, barangay, section_name,
      land_class, area, owner_name, tax_dec_no, source_file, cln_norm, aln_norm,
      pin_norm, barangay_norm, owner_norm, tax_dec_norm, source_file_norm)`;
    const batchSize = 250;
    for (let offset = 0; offset < dataset.records.length; offset += batchSize) {
      const batch = dataset.records.slice(offset, offset + batchSize);
      const placeholders = batch.map(() => `(${new Array(19).fill("?").join(",")})`).join(",");
      const values = batch.flatMap((record) => toSearchValues(record, dataset.version));
      await connection.query(
        `INSERT INTO \`${SEARCH_TABLES.staged}\` ${columns} VALUES ${placeholders}`,
        values,
      );
      if (offset === 0 || offset + batch.length === dataset.records.length || (offset + batch.length) % 5_000 === 0) {
        console.log(`Staged ${offset + batch.length} / ${dataset.records.length} search rows.`);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  const staged = await getTableSummary(connection, SEARCH_TABLES.staged);
  if (!staged.versionConsistent || staged.version !== dataset.version || staged.rowCount !== dataset.records.length) {
    throw new Error("Staging-table verification failed after import");
  }
  const summaries = await updateDatasetState(connection, "stage");
  console.log(JSON.stringify({
    status: "staged",
    version: dataset.version,
    rowCount: staged.rowCount,
    diagnostics: dataset.diagnostics,
    search: summaries,
  }));
}

async function activateStagedDataset() {
  await assertMigrationsApplied();
  const staged = await getTableSummary(connection, SEARCH_TABLES.staged);
  if (!staged.available || !staged.versionConsistent || staged.rowCount === 0 || !staged.version) {
    throw new Error("No verified staged search dataset is available for activation");
  }
  assertExpectedVersion(staged.version);

  const hasActive = await tableExists(connection, SEARCH_TABLES.active);
  const hasPrevious = await tableExists(connection, SEARCH_TABLES.previous);
  await connection.query(`DROP TABLE IF EXISTS \`${SEARCH_TABLES.retired}\``);

  const renames = [];
  if (hasPrevious) renames.push(`\`${SEARCH_TABLES.previous}\` TO \`${SEARCH_TABLES.retired}\``);
  if (hasActive) renames.push(`\`${SEARCH_TABLES.active}\` TO \`${SEARCH_TABLES.previous}\``);
  renames.push(`\`${SEARCH_TABLES.staged}\` TO \`${SEARCH_TABLES.active}\``);
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);

  // RENAME TABLE is the durable atomic boundary. Everything after it is advisory:
  // a metadata or cleanup error must not make the deployer think the swap did not occur.
  const warnings = [];
  let summaries = { active: staged, staged: { available: false, version: null, rowCount: 0, versionConsistent: false } };
  try {
    summaries = await updateDatasetState(connection, "activate");
  } catch (error) {
    warnings.push(`Dataset-state refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await connection.query(`DROP TABLE IF EXISTS \`${SEARCH_TABLES.retired}\``);
  } catch (error) {
    warnings.push(`Retired-table cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const warning of warnings) console.warn(`[WARN] ${warning}`);
  console.log(JSON.stringify({ status: "activated", durable: true, version: staged.version, rowCount: staged.rowCount, warnings, search: summaries }));
}

async function rollbackDataset() {
  await assertMigrationsApplied();
  const previous = await getTableSummary(connection, SEARCH_TABLES.previous);
  if (!previous.available || !previous.versionConsistent || previous.rowCount === 0 || !previous.version) {
    throw new Error("No verified previous search dataset is available for rollback");
  }
  assertExpectedVersion(previous.version);
  if (await tableExists(connection, SEARCH_TABLES.staged)) {
    throw new Error("A staged dataset already exists. Activate it or remove it before rollback.");
  }

  const hasActive = await tableExists(connection, SEARCH_TABLES.active);
  const renames = [];
  if (hasActive) renames.push(`\`${SEARCH_TABLES.active}\` TO \`${SEARCH_TABLES.staged}\``);
  renames.push(`\`${SEARCH_TABLES.previous}\` TO \`${SEARCH_TABLES.active}\``);
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);

  const warnings = [];
  let summaries = { active: previous };
  try {
    summaries = await updateDatasetState(connection, "rollback");
  } catch (error) {
    warnings.push(`Dataset-state refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const warning of warnings) console.warn(`[WARN] ${warning}`);
  console.log(JSON.stringify({ status: "rolled-back", durable: true, version: previous.version, rowCount: previous.rowCount, warnings, search: summaries }));
}

try {
  if (command === "status") {
    await assertMigrationsApplied();
    console.log(JSON.stringify({ status: "ok", search: await getAllSearchTableSummaries(connection) }, null, 2));
  } else {
    await acquireNamedLock(connection, "boac_gis_map_import", 120);
    lockHeld = true;
    if (command === "stage") await stageDataset();
    if (command === "activate") await activateStagedDataset();
    if (command === "rollback") await rollbackDataset();
  }
} finally {
  if (lockHeld) {
    try {
      await releaseNamedLock(connection, "boac_gis_map_import");
    } catch (error) {
      console.warn(`[WARN] Database lock cleanup failed; closing the connection will release it: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    await connection.end();
  } catch (error) {
    console.warn(`[WARN] Database connection cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
