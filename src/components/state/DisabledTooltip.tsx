import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Explains *why* a control is disabled. Backed by a real tooltip so the reason
 * is reachable by keyboard as well as hover — a disabled ERP action without a
 * stated reason is a dead end for the user.
 */
export function DisabledTooltip({
  reason,
  children,
}: {
  reason: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        tabIndex={0}
        className="inline-flex cursor-not-allowed items-center"
        aria-label={reason}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
