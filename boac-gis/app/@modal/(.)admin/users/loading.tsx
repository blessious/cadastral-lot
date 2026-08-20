export default function AdminUsersLoading() {
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-zinc-950/45 backdrop-blur-sm" role="status">
      <div className="glass-panel flex items-center gap-3 rounded-xl px-5 py-4 text-sm font-semibold text-[var(--on-surface)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0051d5]/25 border-t-[#0051d5]" />
        Loading user administration…
      </div>
    </div>
  );
}
