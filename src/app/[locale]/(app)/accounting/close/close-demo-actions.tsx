"use client";

import { toast } from "@/components/toast";

export function CloseDemoToolbar({ period }: { period: string }) {
  return (
    <form action="#" className="flex items-center gap-2" onSubmit={(e) => e.preventDefault()}>
      <input
        name="period"
        type="month"
        defaultValue={period}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
      />
      <button
        type="button"
        className="cursor-pointer rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200"
        onClick={() => toast.message("Period filter is visual-only in this template.")}
      >
        Go
      </button>
    </form>
  );
}

export function CloseStartDemo({ period }: { period: string }) {
  return (
    <button
      type="button"
      className="mt-4 cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
      onClick={() => toast.success(`Run close for ${period} (demo)`)}
    >
      Run close for {period}
    </button>
  );
}

export function CloseRescanDemo({ period }: { period: string }) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-200"
      onClick={() => toast.message(`Re-scan ${period} (demo)`)}
    >
      Re-scan
    </button>
  );
}

export function CloseStepDemo({ period, stepName }: { period: string; stepName: string }) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
      onClick={() => toast.success(`Step ${stepName} marked complete (demo) · ${period}`)}
    >
      Mark complete
    </button>
  );
}
