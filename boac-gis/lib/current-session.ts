import "server-only";

import { cookies } from "next/headers";

import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function requireAdminSession() {
  const session = await getCurrentSession();
  if (session?.role !== "admin") {
    return null;
  }
  return session;
}
