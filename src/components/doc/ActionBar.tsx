"use client";

import { Button } from "@/components/ui/button";
import type { Action } from "@/lib/state-machines";

export type ActionBarProps = {
  actions: Action[];
  onAction: (action: Action) => void;
  disabled?: boolean;
  resolveLabel?: (action: Action) => string;
};

/**
 * Renders the legal state-machine transitions for a document.
 *
 * The first non-destructive action is the visual primary — in an ERP the
 * expected next step (submit → approve → post) should be unmistakable, with
 * secondary and destructive transitions clearly subordinate.
 */
export function ActionBar({
  actions,
  onAction,
  disabled,
  resolveLabel,
}: ActionBarProps) {
  if (actions.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No actions available at this state.
      </p>
    );
  }

  const primaryIndex = actions.findIndex((a) => !a.destructive);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action, index) => (
        <Button
          key={action.id}
          type="button"
          size="sm"
          variant={
            action.destructive
              ? "destructive"
              : index === primaryIndex
                ? "default"
                : "outline"
          }
          disabled={disabled}
          onClick={() => onAction(action)}
        >
          {resolveLabel ? resolveLabel(action) : action.label}
        </Button>
      ))}
    </div>
  );
}
