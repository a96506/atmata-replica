"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/export/csv";

export type ExportCsvButtonProps<T> = {
  /** Rows to export — already-fetched list data (no new server call). */
  rows: T[];
  /** Column definitions matching the visible list columns. */
  columns: CsvColumn<T>[];
  /** Download filename (without extension). */
  filename: string;
  /** Button label. */
  label?: string;
  /** Disable the button. Empty rows still export a header-only CSV. */
  disabled?: boolean;
};

export function ExportCsvButton<T>({
  rows,
  columns,
  filename,
  label = "Export CSV",
  disabled,
}: ExportCsvButtonProps<T>) {
  const onClick = React.useCallback(() => {
    const csv = toCsv(rows, columns);
    downloadCsv(csv, filename);
  }, [rows, columns, filename]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
    >
      <Download />
      {label}
    </Button>
  );
}
