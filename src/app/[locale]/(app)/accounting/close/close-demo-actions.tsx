"use client";

import { toast } from "@/components/toast";

export function CloseDemoToolbar({ period }: { period: string }) {
  return (
    <form action="#" className="flex items-center gap-2" onSubmit={(e) => e.preventDefault()}>
      <input
        name="period"
        type="month"
        defaultValue={period}
        className="rounded-md border border-input px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
      />
      <button
        type="button"
        className="cursor-pointer rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
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
      className="mt-4 cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary"
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
      className="cursor-pointer rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
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
      className="cursor-pointer rounded bg-status-success-muted text-status-success-foreground ring-1 ring-status-success-border px-3 py-1 text-xs font-medium hover:bg-status-success/20"
      onClick={() => toast.success(`Step ${stepName} marked complete (demo) · ${period}`)}
    >
      Mark complete
    </button>
  );
}
