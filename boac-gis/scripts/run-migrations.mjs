import mysql from "mysql2/promise";

import { getMySqlConfig, loadRuntimeEnv } from "./lib/runtime-config.mjs";
import {
  acquireNamedLock,
  ensureMigrationTables,
  MIGRATIONS,
  releaseNamedLock,
  updateDatasetState,
} from "./lib/map-schema.mjs";

const config = getMySqlConfig(await loadRuntimeEnv());
const bootstrap = await mysql.createConnection({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  multipleStatements: false,
});

try {
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrap.changeUser({ database: config.database });
  await acquireNamedLock(bootstrap, "boac_gis_schema_migrations", 60);
  try {
    await ensureMigrationTables(bootstrap);
    const [appliedRows] = await bootstrap.query(
      "SELECT version, checksum FROM gis_schema_migrations ORDER BY version",
    );
    const applied = new Map(appliedRows.map((row) => [String(row.version), String(row.checksum)]));

    for (const migration of MIGRATIONS) {
      const priorChecksum = applied.get(migration.version);
      if (priorChecksum && priorChecksum !== migration.checksum) {
        throw new Error(`Migration ${migration.version} checksum does not match migration history`);
      }
      if (priorChecksum) {
        console.log(`Migration ${migration.version} already applied.`);
        continue;
      }

      console.log(`Applying migration ${migration.version}: ${migration.name}`);
      await migration.up(bootstrap);
      await bootstrap.execute(
        "INSERT INTO gis_schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
        [migration.version, migration.name, migration.checksum],
      );
    }
    const summaries = await updateDatasetState(bootstrap, "migrate");
    console.log(JSON.stringify({ status: "ok", migrations: MIGRATIONS.length, search: summaries }));
  } finally {
    await releaseNamedLock(bootstrap, "boac_gis_schema_migrations");
  }
} finally {
  await bootstrap.end();
}
