import "server-only";

import sql from "mssql";

declare global {
  // eslint-disable-next-line no-var
  var boacGisSqlPool: Promise<sql.ConnectionPool> | undefined;
}

function getSqlConfig(): sql.config {
  const serverValue = process.env.DB_SERVER?.trim();
  const database = process.env.DB_DATABASE?.trim();
  const user = process.env.DB_USERNAME?.trim();
  const password = process.env.DB_PASSWORD;

  if (!serverValue || !database || !user || !password) {
    throw new Error("SQL Server environment variables are incomplete");
  }

  const [server, portText] = serverValue.split(",", 2);
  const port = portText ? Number(portText) : 1433;
  if (!server || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_SERVER must use the format hostname,port");
  }

  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false",
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

export function getSqlPool(): Promise<sql.ConnectionPool> {
  if (!global.boacGisSqlPool) {
    global.boacGisSqlPool = new sql.ConnectionPool(getSqlConfig()).connect().catch((error) => {
      global.boacGisSqlPool = undefined;
      throw error;
    });
  }
  return global.boacGisSqlPool;
}
