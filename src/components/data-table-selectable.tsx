"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ServerPaginationBar,
  type ServerPagination,
} from "@/components/data-table";

export type { ServerPagination };

type Column = {
  key: string;
  label: string;
  className?: string;
};

export type SelectableDataTableProps = {
  columns: Column[];
  rows: ReactNode[][];
  /** Parallel to `rows`; identifies which doc each row represents. */
  rowIds: string[];
  emptyMessage?: ReactNode;
  /** Toolbar rendered above the table when any row is selected. */
  renderBulkActions?: (selectedIds: string[], clear: () => void) => ReactNode;
  /**
   * Server-driven paging: Previous/Next update URL `?page=`.
   * `rows` must already be the current page from the server.
   */
  serverPagination?: ServerPagination;
};

export function SelectableDataTable({
  columns,
  rows,
  rowIds,
  emptyMessage,
  renderBulkActions,
  serverPagination,
}: SelectableDataTableProps) {
  const t = useTranslations("common.dataTable");
  const resolvedEmptyMessage = emptyMessage ?? t("emptyMessage");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-input bg-card p-8 text-center text-sm text-foreground">
        {resolvedEmptyMessage}
      </div>
    );
  }

  const allSelected = rows.length > 0 && rows.every((_, i) => selected.has(rowIds[i]));
  const someSelected = selected.size > 0 && !allSelected;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(() => (allSelected ? new Set() : new Set(rowIds)));
  };

  const clear = () => setSelected(new Set());
  const selectedArr = Array.from(selected);

  const pageCount = serverPagination
    ? Math.max(1, Math.ceil(serverPagination.total / serverPagination.pageSize))
    : 1;
  const safePage = serverPagination
    ? Math.min(Math.max(serverPagination.page, 1), pageCount)
    : 1;
  const showServerPager =
    serverPagination != null &&
    (serverPagination.total > serverPagination.pageSize ||
      serverPagination.page > 1);

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          <span className="text-primary">
            <strong>{selected.size}</strong> selected
            <button
              type="button"
              onClick={clear}
              className="ms-2 cursor-pointer text-xs text-primary hover:underline"
            >
              Clear
            </button>
          </span>
          {renderBulkActions ? <span>{renderBulkActions(selectedArr, clear)}</span> : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-start text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label={t("selectAllRows")}
                />
              </th>
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((cells, i) => {
              const id = rowIds[i];
              const isSel = selected.has(id);
              return (
                <tr
                  key={id}
                  className={isSel ? "bg-primary/10/40" : "hover:bg-muted"}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(id)}
                      aria-label={t("selectRow", { id })}
                    />
                  </td>
                  {cells.map((cell, j) => (
                    <td key={j} className={`px-4 py-3 ${columns[j]?.className ?? ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showServerPager && serverPagination ? (
        <React.Suspense fallback={null}>
          <ServerPaginationBar
            page={safePage}
            pageSize={serverPagination.pageSize}
            total={serverPagination.total}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}
