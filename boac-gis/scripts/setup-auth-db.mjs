import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import mysql from "mysql2/promise";

async function readHidden(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    const fallback = createInterface({ input: stdin, output: stdout });
    const answer = await fallback.question(question);
    fallback.close();
    return answer;
  }

  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolvePassword, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish();
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          resolvePassword(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = Array.from(value).slice(0, -1).join("");
            stdout.write("\b \b");
          }
        } else {
          value += character;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function readConfig() {
  const values = { ...process.env };
  for (const fileName of ["server_config.env", ".env"]) {
    try {
      const text = await readFile(resolve("..", fileName), "utf8");
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        if (!values[key]) values[key] = line.slice(separator + 1).trim();
      }
    } catch {
      // Environment variables alone are also supported.
    }
  }
  return values;
}

function getMySqlConfig(values) {
  const legacyServer = values.DB_SERVER?.trim();
  const [legacyHost, legacyPortText] = legacyServer ? legacyServer.split(",", 2) : ["", ""];
  const host = values.DB_HOST?.trim() || legacyHost || "127.0.0.1";
  const port = Number(values.DB_PORT?.trim() || legacyPortText || "3306");
  const database = values.DB_DATABASE?.trim() || "cadastral_auth";
  const user = values.DB_USERNAME?.trim() || values.DB_USER?.trim() || "root";
  const password = values.DB_PASSWORD ?? "";

  if (!host || !database || !user) {
    console.error("MySQL settings are incomplete.");
    process.exit(1);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("DB_PORT must be a valid TCP port.");
    process.exit(1);
  }
  if (!/^[A-Za-z0-9_$]+$/.test(database)) {
    console.error("DB_DATABASE must contain only letters, numbers, underscore, or dollar sign.");
    process.exit(1);
  }

  return { host, port, database, user, password };
}

async function initializeAuthDatabase(config) {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: false,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.changeUser({ database: config.database });
    await connection.query(`
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
    await connection.end();
  }
}

const config = getMySqlConfig(await readConfig());
const prompt = createInterface({ input: stdin, output: stdout });
const username = (await prompt.question("Username to create or update: ")).trim().toLowerCase();
const displayName = (await prompt.question("Display name: ")).trim();
const roleInput = (await prompt.question("Role [admin/viewer] (default admin): ")).trim().toLowerCase();
prompt.close();
const password = await readHidden("Password (12+ characters): ");

const role = roleInput || "admin";
if (!username || password.length < 12 || !["admin", "viewer"].includes(role)) {
  console.error("A username, a 12+ character password, and an admin/viewer role are required.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
const passwordHash = `scrypt$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;

await initializeAuthDatabase(config);
const pool = mysql.createPool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  connectionLimit: 2,
});

try {
  await pool.execute(
    `
      INSERT INTO gis_users (id, username, password_hash, display_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        display_name = VALUES(display_name),
        role = VALUES(role),
        is_active = 1
    `,
    [randomUUID(), username, passwordHash, displayName || null, role],
  );

  console.log(`\nUser '${username}' was saved to ${config.database}.gis_users.`);
  if (!config.AUTH_SECRET || config.AUTH_SECRET.length < 32) {
    console.log("Add this server-only value to server_config.env:");
    console.log(`AUTH_SECRET=${randomBytes(48).toString("base64url")}`);
  }
} finally {
  await pool.end();
}
