export default function Loading() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[var(--map-container-bg)]" aria-busy="true" aria-label="Loading GeoLGU Navigator">
      <div className="absolute inset-x-3 top-3 h-12 animate-pulse rounded-xl bg-white/65 shadow-sm md:inset-x-auto md:left-1/2 md:w-[48rem] md:-translate-x-1/2" />
      <div className="glass-panel flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold text-[var(--on-surface)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0051d5]/25 border-t-[#0051d5]" />
        Loading GeoLGU Navigator…
      </div>
    </main>
  );
}
