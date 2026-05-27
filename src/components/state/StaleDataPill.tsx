"use client";

import { useRouter } from "next/navigation";

export function StaleDataPill({
  updatedAt,
  label = "Refresh",
}: {
  updatedAt: string;
  label?: string;
}) {
  const router = useRouter();
  const ts = new Date(updatedAt);
  const diffMin = Math.max(0, Math.floor((Date.now() - ts.getTime()) / 60_000));
  const text =
    diffMin < 1
      ? "Just now"
      : diffMin < 60
        ? `${diffMin} min ago`
        : diffMin < 1440
          ? `${Math.floor(diffMin / 60)} h ago`
          : `${Math.floor(diffMin / 1440)} d ago`;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
      <span>Updated {text}</span>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="cursor-pointer rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-900 hover:bg-slate-200"
      >
        {label}
      </button>
    </div>
  );
}
