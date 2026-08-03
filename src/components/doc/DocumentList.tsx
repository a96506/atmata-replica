import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/PageHeader";

export type DocumentListProps = {
  title?: string;
  subtitle?: string;
  toolbar?: ReactNode;
  filters?: ReactNode;
  primaryAction?: ReactNode;
  children: ReactNode;
};

/**
 * Standard chrome for every document list screen: title block, a filter/toolbar
 * strip, then the table. Delegates the heading to `PageHeader` so list pages and
 * detail pages share one typographic scale.
 */
export function DocumentList({
  title,
  subtitle,
  toolbar,
  filters,
  primaryAction,
  children,
}: DocumentListProps) {
  return (
    <div className="flex flex-col gap-4">
      {title || primaryAction ? (
        <PageHeader
          title={title ?? ""}
          description={subtitle}
          actions={primaryAction}
        />
      ) : null}

      {toolbar || filters ? (
        <div className="bg-card flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        </div>
      ) : null}

      {children}
    </div>
  );
}
