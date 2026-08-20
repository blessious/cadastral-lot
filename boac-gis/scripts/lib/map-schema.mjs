import { createHash } from "node:crypto";

export const SEARCH_TABLES = Object.freeze({
  active: "cadastral_lot_search",
  staged: "cadastral_lot_search_staging",
  previous: "cadastral_lot_search_previous",
  retired: "cadastral_lot_search_retired",
});

const SAFE_TABLES = new Set(Object.values(SEARCH_TABLES));

function quoteTable(table) {
  if (!SAFE_TABLES.has(table)) throw new Error(`Unsupported search table: ${table}`);
  return `\`${table}\``;
}

export async function tableExists(connection, table) {
  if (!SAFE_TABLES.has(table)) throw new Error(`Unsupported search table: ${table}`);
  const [rows] = await connection.execute(
    `SELECT 1 AS present
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT 1 AS present
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(connection, table, index) {
  const [rows] = await connection.execute(
    `SELECT 1 AS present
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

export async function createSearchTable(connection, table) {
  const target = quoteTable(table);
  await connection.query(`CREATE TABLE IF NOT EXISTS ${target} (
    id VARCHAR(191) NOT NULL PRIMARY KEY,
    dataset_version VARCHAR(64) NOT NULL,
    cln VARCHAR(150) NULL,
    aln VARCHAR(150) NULL,
    pin VARCHAR(150) NULL,
    barangay VARCHAR(150) NULL,
    section_name VARCHAR(150) NULL,
    land_class VARCHAR(150) NULL,
    area VARCHAR(100) NULL,
    owner_name VARCHAR(500) NULL,
    tax_dec_no VARCHAR(150) NULL,
    source_file VARCHAR(255) NOT NULL,
    cln_norm VARCHAR(191) NOT NULL DEFAULT '',
    aln_norm VARCHAR(191) NOT NULL DEFAULT '',
    pin_norm VARCHAR(191) NOT NULL DEFAULT '',
    barangay_norm VARCHAR(191) NOT NULL DEFAULT '',
    owner_norm VARCHAR(500) NOT NULL DEFAULT '',
    tax_dec_norm VARCHAR(191) NOT NULL DEFAULT '',
    source_file_norm VARCHAR(255) NOT NULL DEFAULT '',
    INDEX idx_search_dataset_version (dataset_version),
    INDEX idx_search_cln_norm (cln_norm),
    INDEX idx_search_aln_norm (aln_norm),
    INDEX idx_search_pin_norm (pin_norm),
    INDEX idx_search_barangay_norm (barangay_norm),
    INDEX idx_search_owner_norm (owner_norm(191)),
    INDEX idx_search_tax_dec_norm (tax_dec_norm),
    INDEX idx_search_source_file_norm (source_file_norm(191))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function ensureColumn(connection, table, name, definition) {
  if (!(await columnExists(connection, table, name))) {
    await connection.query(`ALTER TABLE ${quoteTable(table)} ADD COLUMN \`${name}\` ${definition}`);
  }
}

async function ensureIndex(connection, table, name, expression) {
  if (!(await indexExists(connection, table, name))) {
    await connection.query(`ALTER TABLE ${quoteTable(table)} ADD INDEX \`${name}\` (${expression})`);
  }
}

export async function upgradeActiveSearchTable(connection) {
  const table = SEARCH_TABLES.active;
  if (!(await tableExists(connection, table))) {
    await createSearchTable(connection, table);
    return;
  }

  await connection.query(`ALTER TABLE ${quoteTable(table)} MODIFY COLUMN id VARCHAR(191) NOT NULL`);
  await ensureColumn(connection, table, "dataset_version", "VARCHAR(64) NULL");
  await ensureColumn(connection, table, "cln_norm", "VARCHAR(191) NULL");
  await ensureColumn(connection, table, "aln_norm", "VARCHAR(191) NULL");
  await ensureColumn(connection, table, "pin_norm", "VARCHAR(191) NULL");
  await ensureColumn(connection, table, "barangay_norm", "VARCHAR(191) NULL");
  await ensureColumn(connection, table, "owner_norm", "VARCHAR(500) NULL");
  await ensureColumn(connection, table, "tax_dec_norm", "VARCHAR(191) NULL");
  await ensureColumn(connection, table, "source_file_norm", "VARCHAR(255) NULL");

  await connection.query(`UPDATE ${quoteTable(table)} SET
    dataset_version = COALESCE(NULLIF(dataset_version, ''), 'legacy'),
    cln_norm = LOWER(TRIM(COALESCE(cln, ''))),
    aln_norm = LOWER(TRIM(COALESCE(aln, ''))),
    pin_norm = LOWER(TRIM(COALESCE(pin, ''))),
    barangay_norm = LOWER(TRIM(COALESCE(barangay, ''))),
    owner_norm = LOWER(TRIM(COALESCE(owner_name, ''))),
    tax_dec_norm = LOWER(TRIM(COALESCE(tax_dec_no, ''))),
    source_file_norm = LOWER(TRIM(COALESCE(source_file, '')))
    WHERE dataset_version IS NULL
       OR cln_norm IS NULL OR aln_norm IS NULL OR pin_norm IS NULL
       OR barangay_norm IS NULL OR owner_norm IS NULL OR tax_dec_norm IS NULL
       OR source_file_norm IS NULL`);

  await connection.query(`ALTER TABLE ${quoteTable(table)}
    MODIFY COLUMN dataset_version VARCHAR(64) NOT NULL,
    MODIFY COLUMN cln_norm VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY COLUMN aln_norm VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY COLUMN pin_norm VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY COLUMN barangay_norm VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY COLUMN owner_norm VARCHAR(500) NOT NULL DEFAULT '',
    MODIFY COLUMN tax_dec_norm VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY COLUMN source_file_norm VARCHAR(255) NOT NULL DEFAULT ''`);

  await ensureIndex(connection, table, "idx_search_dataset_version", "dataset_version");
  await ensureIndex(connection, table, "idx_search_cln_norm", "cln_norm");
  await ensureIndex(connection, table, "idx_search_aln_norm", "aln_norm");
  await ensureIndex(connection, table, "idx_search_pin_norm", "pin_norm");
  await ensureIndex(connection, table, "idx_search_barangay_norm", "barangay_norm");
  await ensureIndex(connection, table, "idx_search_owner_norm", "owner_norm(191)");
  await ensureIndex(connection, table, "idx_search_tax_dec_norm", "tax_dec_norm");
  await ensureIndex(connection, table, "idx_search_source_file_norm", "source_file_norm(191)");
}

export async function ensureMigrationTables(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS gis_schema_migrations (
    version VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS cadastral_dataset_state (
    singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    active_version VARCHAR(64) NULL,
    active_count BIGINT UNSIGNED NULL,
    staged_version VARCHAR(64) NULL,
    staged_count BIGINT UNSIGNED NULL,
    previous_version VARCHAR(64) NULL,
    previous_count BIGINT UNSIGNED NULL,
    last_action VARCHAR(32) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`INSERT IGNORE INTO cadastral_dataset_state (singleton_id) VALUES (1)`);
}

export const MIGRATIONS = [
  {
    version: "001",
    name: "versioned_cadastral_search_slots",
    checksum: createHash("sha256").update("001:versioned_cadastral_search_slots:v1").digest("hex"),
    async up(connection) {
      await upgradeActiveSearchTable(connection);
    },
  },
];

export async function getTableSummary(connection, table) {
  if (!(await tableExists(connection, table))) {
    return { available: false, version: null, rowCount: 0, versionConsistent: false };
  }
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS row_count,
            MIN(dataset_version) AS min_version,
            MAX(dataset_version) AS max_version
       FROM ${quoteTable(table)}`,
  );
  const row = rows[0];
  const rowCount = Number(row.row_count ?? 0);
  const minVersion = row.min_version == null ? null : String(row.min_version);
  const maxVersion = row.max_version == null ? null : String(row.max_version);
  return {
    available: true,
    version: minVersion === maxVersion ? minVersion : null,
    rowCount,
    versionConsistent: minVersion === maxVersion && (rowCount === 0 || minVersion !== null),
  };
}

export async function getAllSearchTableSummaries(connection) {
  const [active, staged, previous] = await Promise.all([
    getTableSummary(connection, SEARCH_TABLES.active),
    getTableSummary(connection, SEARCH_TABLES.staged),
    getTableSummary(connection, SEARCH_TABLES.previous),
  ]);
  return { active, staged, previous };
}

export async function updateDatasetState(connection, action) {
  const summaries = await getAllSearchTableSummaries(connection);
  await connection.execute(
    `UPDATE cadastral_dataset_state SET
       active_version = ?, active_count = ?,
       staged_version = ?, staged_count = ?,
       previous_version = ?, previous_count = ?,
       last_action = ?
     WHERE singleton_id = 1`,
    [
      summaries.active.version,
      summaries.active.rowCount,
      summaries.staged.version,
      summaries.staged.rowCount,
      summaries.previous.version,
      summaries.previous.rowCount,
      action,
    ],
  );
  return summaries;
}

export async function acquireNamedLock(connection, name, timeoutSeconds = 60) {
  const [rows] = await connection.execute("SELECT GET_LOCK(?, ?) AS acquired", [name, timeoutSeconds]);
  if (Number(rows[0]?.acquired) !== 1) throw new Error(`Could not acquire database lock '${name}'`);
}

export async function releaseNamedLock(connection, name) {
  await connection.execute("SELECT RELEASE_LOCK(?)", [name]);
}
