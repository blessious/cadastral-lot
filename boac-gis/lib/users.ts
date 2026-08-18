import "server-only";

import type { RowDataPacket } from "mysql2";

import { getMySqlPool } from "@/lib/db";
import { hashPassword } from "@/lib/password";

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
  display_name?: string | null;
  role: string;
  is_active?: number;
  created_at?: Date;
  last_login_at?: Date | null;
};

export type ManagedUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date | null;
  lastLoginAt: Date | null;
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

export async function listUsers(): Promise<ManagedUser[]> {
  const pool = await getMySqlPool();
  const [rows] = await pool.execute<AuthUserRow[]>(`
    SELECT id, username, display_name, role, is_active, created_at, last_login_at
    FROM gis_users
    ORDER BY username ASC
  `);

  return rows.map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.display_name ?? null,
    role: user.role,
    isActive: user.is_active === 1,
    createdAt: user.created_at ?? null,
    lastLoginAt: user.last_login_at ?? null,
  }));
}

export async function createOrUpdateUser(input: {
  username: string;
  displayName: string | null;
  role: "admin" | "viewer";
  password: string;
}): Promise<void> {
  const pool = await getMySqlPool();
  const passwordHash = await hashPassword(input.password);
  await pool.execute(
    `
      INSERT INTO gis_users (id, username, password_hash, display_name, role, is_active)
      VALUES (UUID(), ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        display_name = VALUES(display_name),
        role = VALUES(role),
        is_active = 1
    `,
    [input.username, passwordHash, input.displayName, input.role],
  );
}
