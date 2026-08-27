/**
 * CSV export helpers. RFC 4180 compliant: fields containing commas, quotes,
 * newlines, or leading/trailing whitespace are wrapped in double quotes and
 * embedded double quotes are escaped by doubling. Lines are CRLF-terminated
 * per the spec. UTF-8 with BOM so Excel picks the encoding automatically.
 */

/** Escape a single field per RFC 4180. */
export function escapeCsvField(value: unknown): string {
  if (value == null) return "";
  let str: string;
  if (typeof value === "string") {
    str = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    str = String(value);
  } else if (value instanceof Date) {
    str = value.toISOString();
  } else {
    // Best-effort: serialize objects/arrays as JSON, anything else as String.
    try {
      str = typeof value === "object" ? JSON.stringify(value) : String(value);
    } catch {
      str = "";
    }
  }
  if (/[",\r\n]/.test(str) || /^\s|\s$/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export type CsvColumn<T> = {
  /** Header label. */
  label: string;
  /** Row value accessor — accepts the row object and returns a primitive or Date. */
  value: (row: T) => unknown;
};

/**
 * Build a CSV string from rows + columns. The first line is the header row
 * built from `column.label`; each subsequent line is one row's values in
 * column order. Lines are joined with CRLF.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(","))
    .join("\r\n");
  return [header, body].filter(Boolean).join("\r\n");
}

/** Prefix the CSV with a UTF-8 BOM so Excel reads it as UTF-8. */
export function csvToBlob(csv: string): Blob {
  return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
}

/** Trigger a browser download of the CSV file. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = csvToBlob(csv);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
