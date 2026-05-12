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
          className="cursor-pointer rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
          onClick={() => toast.success(`Match line ${bankLineId} (demo) · session ${sessionId}`)}
        >
          Match
        </button>
      )}
      <button
        type="button"
        className="cursor-pointer rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-900 hover:bg-slate-300"
        onClick={() => toast.message(`Skip line ${bankLineId} (demo)`)}
      >
        Skip
      </button>
    </div>
  );
}
