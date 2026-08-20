import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, UserPlus } from "lucide-react";

import { createUserAction } from "./actions";
import { requireAdminSession } from "@/lib/current-session";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { listUsers } from "@/lib/users";
import { Button } from "@/components/ui/button";

type UsersPageProps = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
  }>;
};

function formatDate(value: Date | string | null): string {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const session = await requireAdminSession();
  if (!session) {
    redirect("/");
  }

  const [users, resolvedSearchParams] = await Promise.all([listUsers(), searchParams]);

  return (
    <main className="min-h-[100svh] overflow-auto bg-zinc-50 px-4 py-5 text-zinc-950 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Administrator
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Users</h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-11 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-950"
          >
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Map
            </Link>
          </Button>
        </header>

        {resolvedSearchParams?.created ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {resolvedSearchParams.created}
          </div>
        ) : null}
        {resolvedSearchParams?.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {resolvedSearchParams.error}
          </div>
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-700" />
            <h2 className="text-base font-bold">Create or Update User</h2>
          </div>
          <form action={createUserAction} className="grid gap-3 md:grid-cols-[1fr_1fr_140px]">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
              Username
              <input
                name="username"
                required
                minLength={3}
                maxLength={100}
                pattern="[a-zA-Z0-9._-]+"
                className="h-11 rounded-md border border-zinc-300 px-3 text-base font-medium outline-none focus:border-emerald-600"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
              Display Name
              <input
                name="displayName"
                maxLength={150}
                className="h-11 rounded-md border border-zinc-300 px-3 text-base font-medium outline-none focus:border-emerald-600"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">
              Role
              <select
                name="role"
                defaultValue="viewer"
                className="h-11 rounded-md border border-zinc-300 px-3 text-base font-medium outline-none focus:border-emerald-600"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700 md:col-span-2">
              Password
              <input
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className="h-11 rounded-md border border-zinc-300 px-3 text-base font-medium outline-none focus:border-emerald-600"
              />
            </label>
            <div className="flex items-end">
              <Button type="submit" className="h-11 w-full bg-emerald-700 hover:bg-emerald-800">
                Save User
              </Button>
            </div>
            <p className="text-xs font-medium text-zinc-500 md:col-span-3">
              Password must be at least {MIN_PASSWORD_LENGTH} characters. Existing usernames are updated.
            </p>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-base font-bold">Existing Users</h2>
          </div>
          <div className="grid gap-3 p-3 md:hidden" data-testid="mobile-user-cards">
            {users.map((user) => (
              <article key={user.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-zinc-950">{user.displayName || user.username}</h3>
                    <p className="truncate text-sm text-zinc-600">@{user.username}</p>
                  </div>
                  <span className={user.isActive ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800" : "rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">Role</dt>
                    <dd className="mt-1 font-semibold capitalize text-zinc-800">{user.role}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-zinc-500">Last login</dt>
                    <dd className="mt-1 font-semibold text-zinc-800">{formatDate(user.lastLoginAt)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block" data-testid="desktop-user-table">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Display Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-semibold text-zinc-950">{user.username}</td>
                    <td className="px-4 py-3 text-zinc-700">{user.displayName || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-bold uppercase text-zinc-700">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={user.isActive ? "text-emerald-700" : "text-red-600"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{formatDate(user.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
