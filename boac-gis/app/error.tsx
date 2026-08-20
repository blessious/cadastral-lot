"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--background)] p-6 text-[var(--foreground)]">
      <section className="w-full max-w-md rounded-2xl border bg-[var(--card)] p-6 text-center shadow-xl" role="alert">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-bold">The map could not finish loading</h1>
        <p className="mt-2 text-sm text-[var(--on-surface-variant)]">Your session and saved map preferences are safe. Check the connection and try again.</p>
        <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0051d5] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </section>
    </main>
  );
}
