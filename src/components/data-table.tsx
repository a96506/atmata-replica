"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export type Column = {
  key: string;
  label: string;
  /** Existing pages pass `text-right` / `text-end` (and tabular-nums) here. */
  className?: string;
  /** Opt out of sorting for a column (e.g. an actions column). */
  sortable?: boolean;
};

/** When set, `rows` is already one server page — do not client-slice. */
export type ServerPagination = {
  /** 1-based page from URL `?page=`. */
  page: number;
  pageSize: number;
  total: number;
};

export type DataTableProps = {
  columns: Column[];
  /** Row cells, positionally matched to `columns`. */
  rows: React.ReactNode[][];
  emptyMessage?: string;
  /** Overrides the default empty-state title. */
  emptyTitle?: string;
  /** Sorting is on by default; pass false for pre-ordered data like ledgers. */
  sortable?: boolean;
  /** Rows per page. `0` disables pagination. Ignored when `serverPagination` is set. */
  pageSize?: number;
  /**
   * Server-driven paging: Previous/Next update URL `?page=` (preserve other
   * searchParams). `rows` must already be the current page from the server.
   */
  serverPagination?: ServerPagination;
  /** Constrains body height and keeps the header pinned while scrolling. */
  maxBodyHeight?: number | string;
  className?: string;
};

/**
 * Shared table for every list and document-lines view.
 *
 * Deliberately keeps the original `columns` + `rows: ReactNode[][]` contract so
 * all 44 existing call sites work untouched, while adding the things an ERP
 * grid needs: client-side sorting, pagination, a sticky header, and numeric
 * alignment inferred from the column's own `text-right` / `text-end` class.
 *
 * Pass `serverPagination` for heavy lists so Next/Previous fetch the next
 * page from the server via `?page=` instead of slicing a full client array.
 */
export function DataTable({
  columns,
  rows,
  emptyMessage,
  emptyTitle,
  sortable = true,
  pageSize = 0,
  serverPagination,
  maxBodyHeight,
  className,
}: DataTableProps) {
  const t = useTranslations("common.dataTable");
  const resolvedEmptyMessage = emptyMessage ?? t("emptyMessage");
  const resolvedEmptyTitle = emptyTitle ?? t("emptyTitle");
  const [sort, setSort] = React.useState<{
    index: number;
    dir: "asc" | "desc";
  } | null>(null);
  const [page, setPage] = React.useState(0);
  const serverMode = serverPagination != null;

  // Reset client paging when the underlying data changes (filters, search).
  React.useEffect(() => {
    if (!serverMode) setPage(0);
  }, [rows.length, serverMode]);

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) =>
        factor * compareCells(a[sort.index], b[sort.index]),
    );
  }, [rows, sort]);

  // Server mode: `rows` is already one page — never slice a larger client list.
  // Client sort stays on the current page only (day-one).
  const pageCount = serverMode
    ? Math.max(1, Math.ceil(serverPagination.total / serverPagination.pageSize))
    : pageSize > 0
      ? Math.ceil(sortedRows.length / pageSize)
      : 1;
  const safePage = serverMode
    ? Math.min(
        Math.max(serverPagination.page, 1),
        pageCount,
      )
    : Math.min(page, Math.max(pageCount - 1, 0));
  const visibleRows = serverMode
    ? sortedRows
    : pageSize > 0
      ? sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize)
      : sortedRows;

  if (rows.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>{resolvedEmptyTitle}</EmptyTitle>
          <EmptyDescription>{resolvedEmptyMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const toggleSort = (index: number) => {
    setSort((current) => {
      if (current?.index !== index) return { index, dir: "asc" };
      if (current.dir === "asc") return { index, dir: "desc" };
      return null;
    });
  };

  const showClientPager = !serverMode && pageSize > 0 && pageCount > 1;
  const showServerPager =
    serverMode &&
    (serverPagination.total > serverPagination.pageSize ||
      serverPagination.page > 1);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className={cn(
          "bg-card relative overflow-auto rounded-lg border",
          maxBodyHeight != null && "overflow-y-auto",
        )}
        style={
          maxBodyHeight != null
            ? {
                maxHeight:
                  typeof maxBodyHeight === "number"
                    ? `${maxBodyHeight}px`
                    : maxBodyHeight,
              }
            : undefined
        }
      >
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur">
            <TableRow className="hover:bg-transparent">
              {columns.map((col, index) => {
                const isNumeric = isNumericColumn(col);
                const canSort = sortable && col.sortable !== false;
                const activeSort = sort?.index === index ? sort.dir : null;

                return (
                  <TableHead
                    key={col.key}
                    aria-sort={
                      activeSort
                        ? activeSort === "asc"
                          ? "ascending"
                          : "descending"
                        : canSort
                          ? "none"
                          : undefined
                    }
                    className={cn(
                      "text-muted-foreground h-9 text-xs font-medium tracking-wide uppercase",
                      isNumeric && "text-end",
                      col.className,
                    )}
                  >
                    {canSort ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSort(index)}
                        className={cn(
                          "text-muted-foreground hover:text-foreground -mx-2 h-7 gap-1 px-2 text-xs font-medium tracking-wide uppercase",
                          isNumeric && "ms-auto",
                        )}
                      >
                        {col.label}
                        {activeSort === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : activeSort === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </Button>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {visibleRows.map((cells, rowIndex) => (
              <TableRow key={rowIndex}>
                {cells.map((cell, cellIndex) => {
                  const col = columns[cellIndex];
                  return (
                    <TableCell
                      key={cellIndex}
                      className={cn(
                        "py-2.5",
                        isNumericColumn(col) && "text-end tabular-nums",
                        col?.className,
                      )}
                    >
                      {cell}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

      {showClientPager ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs tabular-nums">
            {t("range", {
              from: safePage * pageSize + 1,
              to: Math.min((safePage + 1) * pageSize, sortedRows.length),
              total: sortedRows.length,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Previous/Next that only touch URL `?page=` (preserve other searchParams). */
export function ServerPaginationBar({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useTranslations("common.dataTable");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-muted-foreground text-xs tabular-nums">
        {t("range", { from, to, total })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          {t("previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goTo(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

/** Columns already flagged `text-right` / `text-end` by call sites are numeric. */
function isNumericColumn(col?: Column) {
  const cls = col?.className ?? "";
  return cls.includes("text-right") || cls.includes("text-end");
}

/**
 * Cells are ReactNodes, so sorting works off rendered text. Numeric strings
 * (including currency like `KWD 1,240.500`) compare numerically; everything
 * else falls back to a locale-aware string compare.
 */
function compareCells(a: React.ReactNode, b: React.ReactNode): number {
  const left = cellText(a);
  const right = cellText(b);

  const leftNum = parseNumeric(left);
  const rightNum = parseNumeric(right);
  if (leftNum !== null && rightNum !== null) return leftNum - rightNum;

  return left.localeCompare(right, undefined, { numeric: true });
}

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Flatten a ReactNode into comparable text. */
function cellText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).join(" ");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return cellText(props.children);
  }
  return "";
}
