"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/current-session";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { createOrUpdateUser } from "@/lib/users";

function redirectWithStatus(type: "created" | "error", message: string): never {
  redirect(`/admin/users?${type}=${encodeURIComponent(message)}`);
}

export async function createUserAction(formData: FormData) {
  const session = await requireAdminSession();
  if (!session) {
    redirect("/login");
  }

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const role = String(formData.get("role") ?? "viewer").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!/^[a-z0-9._-]{3,100}$/.test(username)) {
    redirectWithStatus("error", "Username must be 3-100 characters using letters, numbers, dot, dash, or underscore.");
  }
  if (role !== "admin" && role !== "viewer") {
    redirectWithStatus("error", "Role must be admin or viewer.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    redirectWithStatus("error", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  await createOrUpdateUser({
    username,
    displayName: displayName || null,
    role,
    password,
  });

  revalidatePath("/admin/users");
  redirectWithStatus("created", `User ${username} was saved.`);
}
