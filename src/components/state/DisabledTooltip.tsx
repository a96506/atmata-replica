import type { ReactNode } from "react";

/**
 * Wraps a disabled-control so the user sees *why* it's disabled. Uses
 * the native `title` attribute for now (good enough for tooltip text);
 * a richer Radix Tooltip can replace this later without changing call sites.
 */
export function DisabledTooltip({
  reason,
  children,
}: {
  reason: string;
  children: ReactNode;
}) {
  return (
    <span
      title={reason}
      aria-label={reason}
      className="inline-flex cursor-not-allowed items-center"
    >
      {children}
    </span>
  );
}
