"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from "lucide-react";
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
  /** Existing pages pass `text-right` / `text-right tabular-nums` here. */
  className?: string;
  /** Opt out of sorting for a column (e.g. an actions column). */
  sortable?: boolean;
};

export type DataTableProps = {
  columns: Column[];
  /** Row cells, positionally matched to `columns`. */
  rows: React.ReactNode[][];
  emptyMessage?: string;
  /** Sorting is on by default; pass false for pre-ordered data like ledgers. */
  sortable?: boolean;
  /** Rows per page. `0` disables pagination. */
  pageSize?: number;
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
 * alignment inferred from the column's own `text-right` class.
 */
export function DataTable({
  columns,
  rows,
  emptyMessage = "No data.",
  sortable = true,
  pageSize = 0,
  maxBodyHeight,
  className,
}: DataTableProps) {
  const [sort, setSort] = React.useState<{
    index: number;
    dir: "asc" | "desc";
  } | null>(null);
  const [page, setPage] = React.useState(0);

  // Reset paging when the underlying data changes (filters, search).
  React.useEffect(() => setPage(0), [rows.length]);

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort(
      (a, b) =>
        factor * compareCells(a[sort.index], b[sort.index]),
    );
  }, [rows, sort]);

  const pageCount = pageSize > 0 ? Math.ceil(sortedRows.length / pageSize) : 1;
  const safePage = Math.min(page, Math.max(pageCount - 1, 0));
  const visibleRows =
    pageSize > 0
      ? sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize)
      : sortedRows;

  if (rows.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>{emptyMessage}</EmptyDescription>
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

      {pageSize > 0 && pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs tabular-nums">
            {safePage * pageSize + 1}–
            {Math.min((safePage + 1) * pageSize, sortedRows.length)} of{" "}
            {sortedRows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Columns already flagged `text-right` by call sites are numeric. */
function isNumericColumn(col?: Column) {
  return Boolean(col?.className?.includes("text-right"));
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
