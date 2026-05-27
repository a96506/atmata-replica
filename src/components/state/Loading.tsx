export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-10 text-sm text-slate-600"
    >
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-orange-500" />
      {label}
    </div>
  );
}
