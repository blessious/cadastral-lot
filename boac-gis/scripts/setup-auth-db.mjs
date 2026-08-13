import { randomBytes, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import sql from "mssql";

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

const config = await readConfig();
const [server, portText] = (config.DB_SERVER ?? "").split(",", 2);
if (!server || !config.DB_DATABASE || !config.DB_USERNAME || !config.DB_PASSWORD) {
  console.error("Database settings are missing from ../server_config.env, ../.env, or the process environment.");
  process.exit(1);
}

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

const pool = await new sql.ConnectionPool({
  server,
  port: portText ? Number(portText) : 1433,
  database: config.DB_DATABASE,
  user: config.DB_USERNAME,
  password: config.DB_PASSWORD,
  options: {
    encrypt: config.DB_ENCRYPT === "true",
    trustServerCertificate: config.DB_TRUST_SERVER_CERTIFICATE !== "false",
  },
}).connect();

try {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.gis_users', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.gis_users (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_gis_users PRIMARY KEY DEFAULT NEWID(),
        username NVARCHAR(100) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        display_name NVARCHAR(150) NULL,
        role NVARCHAR(30) NOT NULL CONSTRAINT DF_gis_users_role DEFAULT N'viewer',
        is_active BIT NOT NULL CONSTRAINT DF_gis_users_active DEFAULT 1,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gis_users_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gis_users_updated DEFAULT SYSUTCDATETIME(),
        last_login_at DATETIME2(0) NULL,
        CONSTRAINT CK_gis_users_role CHECK (role IN (N'admin', N'viewer')),
        CONSTRAINT UQ_gis_users_username UNIQUE (username)
      );
    END
  `);

  await pool
    .request()
    .input("username", sql.NVarChar(100), username)
    .input("passwordHash", sql.NVarChar(255), passwordHash)
    .input("displayName", sql.NVarChar(150), displayName || null)
    .input("role", sql.NVarChar(30), role)
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.gis_users WHERE username = @username)
        UPDATE dbo.gis_users
        SET password_hash = @passwordHash,
            display_name = @displayName,
            role = @role,
            is_active = 1,
            updated_at = SYSUTCDATETIME()
        WHERE username = @username;
      ELSE
        INSERT dbo.gis_users (username, password_hash, display_name, role)
        VALUES (@username, @passwordHash, @displayName, @role);
    `);

  console.log(`\nUser '${username}' was saved to dbo.gis_users.`);
  if (!config.AUTH_SECRET || config.AUTH_SECRET.length < 32) {
    console.log("Add this server-only value to server_config.env:");
    console.log(`AUTH_SECRET=${randomBytes(48).toString("base64url")}`);
  }
} finally {
  await pool.close();
}
