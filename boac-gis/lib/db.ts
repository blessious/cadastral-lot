import "server-only";

import mysql, { type Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var boacGisMySqlPool: Promise<Pool> | undefined;
}

type MySqlConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

function getMySqlConfig(): MySqlConfig {
  const host = process.env.DB_HOST?.trim() || "127.0.0.1";
  const portText = process.env.DB_PORT?.trim() || "3306";
  const port = Number(portText);
  const database = process.env.DB_DATABASE?.trim() || "cadastral_auth";
  const user = process.env.DB_USERNAME?.trim() || process.env.DB_USER?.trim() || "root";
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !database || !user) {
    throw new Error("MySQL environment variables are incomplete");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT must be a valid TCP port");
  }
  if (!/^[A-Za-z0-9_$]+$/.test(database)) {
    throw new Error("DB_DATABASE must contain only letters, numbers, underscore, or dollar sign");
  }

  return { host, port, database, user, password };
}

async function initializeAuthDatabase(config: MySqlConfig): Promise<void> {
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
    await bootstrap.query(`
      CREATE TABLE IF NOT EXISTS gis_users (
        id CHAR(36) NOT NULL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(150) NULL,
        role VARCHAR(30) NOT NULL DEFAULT 'viewer',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP NULL,
        UNIQUE KEY uq_gis_users_username (username),
        CONSTRAINT ck_gis_users_role CHECK (role IN ('admin', 'viewer'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } finally {
    await bootstrap.end();
  }
}

export async function getMySqlPool(): Promise<Pool> {
  if (!global.boacGisMySqlPool) {
    global.boacGisMySqlPool = (async () => {
      const config = getMySqlConfig();
      await initializeAuthDatabase(config);
      return mysql.createPool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        connectionLimit: 10,
        waitForConnections: true,
        enableKeepAlive: true,
      });
    })().catch((error) => {
      global.boacGisMySqlPool = undefined;
      throw error;
    });
  }

  return global.boacGisMySqlPool;
}
