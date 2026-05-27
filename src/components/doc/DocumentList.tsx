import type { ReactNode } from "react";

export type DocumentListProps = {
  title?: string;
  subtitle?: string;
  toolbar?: ReactNode;
  filters?: ReactNode;
  primaryAction?: ReactNode;
  children: ReactNode;
};

export function DocumentList({
  title,
  subtitle,
  toolbar,
  filters,
  primaryAction,
  children,
}: DocumentListProps) {
  return (
    <div className="space-y-4">
      {(title || primaryAction) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? (
              <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
            ) : null}
          </div>
          {primaryAction ? <div>{primaryAction}</div> : null}
        </div>
      )}

      {(toolbar || filters) && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        </div>
      )}

      <div>{children}</div>
    </div>
  );
}
