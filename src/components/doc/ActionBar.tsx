"use client";

import { cn } from "@/lib/utils";
import type { Action } from "@/lib/state-machines";

export type ActionBarProps = {
  actions: Action[];
  onAction: (action: Action) => void;
  disabled?: boolean;
  resolveLabel?: (action: Action) => string;
};

export function ActionBar({
  actions,
  onAction,
  disabled,
  resolveLabel,
}: ActionBarProps) {
  if (actions.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        No actions available at this state.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={disabled}
          onClick={() => onAction(a)}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
            a.destructive
              ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
              : "bg-orange-600 text-white hover:bg-orange-700 focus-visible:ring-orange-500",
          )}
        >
          {resolveLabel ? resolveLabel(a) : a.label}
        </button>
      ))}
    </div>
  );
}
