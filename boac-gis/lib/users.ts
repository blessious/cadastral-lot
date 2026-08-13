import "server-only";

import type { RowDataPacket } from "mysql2";

import { getMySqlPool } from "@/lib/db";

export type AuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
};

type AuthUserRow = RowDataPacket & {
  id: string;
  username: string;
  password_hash: string;
  role: string;
};

export async function findActiveUserByUsername(username: string): Promise<AuthUser | null> {
  const pool = await getMySqlPool();
  const [rows] = await pool.execute<AuthUserRow[]>(
    `
      SELECT id, username, password_hash, role
      FROM gis_users
      WHERE username = ? AND is_active = 1
      LIMIT 1
    `,
    [username.trim().toLowerCase()],
  );

  const user = rows[0];
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
  const pool = await getMySqlPool();
  await pool.execute("UPDATE gis_users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?", [userId]);
}
