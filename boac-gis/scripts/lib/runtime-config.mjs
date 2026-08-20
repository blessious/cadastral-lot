import fs from "node:fs/promises";
import path from "node:path";

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    if (key) values[key] = value;
  }
  return values;
}

export async function loadRuntimeEnv(cwd = process.cwd()) {
  const values = {};
  const candidates = [
    path.resolve(cwd, "server_config.env"),
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "..", "server_config.env"),
    path.resolve(cwd, "..", ".env"),
  ];

  for (const file of candidates) {
    try {
      Object.assign(values, parseEnvText(await fs.readFile(file, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) values[key] = value;
  }
  return values;
}

export function getMySqlConfig(values) {
  const host = values.DB_HOST?.trim() || "127.0.0.1";
  const port = Number(values.DB_PORT?.trim() || "3306");
  const database = values.DB_DATABASE?.trim() || "cadastral_auth";
  const user = values.DB_USERNAME?.trim() || values.DB_USER?.trim() || "root";
  const password = values.DB_PASSWORD ?? "";

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

export function readOption(argv, name, fallback = undefined) {
  const direct = argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1];
  return fallback;
}
