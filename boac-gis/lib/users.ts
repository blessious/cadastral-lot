import "server-only";

import sql from "mssql";

import { getSqlPool } from "@/lib/db";

export type AuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
};

export async function findActiveUserByUsername(username: string): Promise<AuthUser | null> {
  const pool = await getSqlPool();
  const result = await pool
    .request()
    .input("username", sql.NVarChar(100), username.trim().toLowerCase())
    .query<{
      id: string;
      username: string;
      password_hash: string;
      role: string;
    }>(`
      SELECT TOP (1) id, username, password_hash, role
      FROM dbo.gis_users
      WHERE username = @username AND is_active = 1
    `);

  const user = result.recordset[0];
  return user
    ? {
        id: user.id,
        username: user.username,
        passwordHash: user.password_hash,
        role: user.role,
      }
    : null;
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  const pool = await getSqlPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, userId)
    .query("UPDATE dbo.gis_users SET last_login_at = SYSUTCDATETIME() WHERE id = @id");
}
