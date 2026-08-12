import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent page title block. Every list, detail, and settings screen uses
 * this so heading size, description tone, and action placement never drift
 * between modules.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Primary/secondary buttons, rendered inline-end on wide screens. */
  actions?: ReactNode;
  className?: string;
  /** Optional slot below the title (filters, tabs, meta badges). */
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground text-sm text-pretty">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
