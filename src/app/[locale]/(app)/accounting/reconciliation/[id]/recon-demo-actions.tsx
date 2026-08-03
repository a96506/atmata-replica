"use client";

import { toast } from "@/components/toast";

export function ReconDemoActions({
  sessionId,
  bankLineId,
  hasMatch,
}: {
  sessionId: string;
  bankLineId: number;
  hasMatch: boolean;
}) {
  return (
    <div className="flex justify-end gap-1">
      {hasMatch && (
        <button
          type="button"
          className="cursor-pointer rounded bg-status-success-muted text-status-success-foreground ring-1 ring-status-success-border px-3 py-1 text-xs font-medium hover:bg-status-success/20"
          onClick={() => toast.success(`Match line ${bankLineId} (demo) · session ${sessionId}`)}
        >
          Match
        </button>
      )}
      <button
        type="button"
        className="cursor-pointer rounded bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
        onClick={() => toast.message(`Skip line ${bankLineId} (demo)`)}
      >
        Skip
      </button>
    </div>
  );
}
