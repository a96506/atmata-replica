import type { ReactNode } from "react";

type Column = {
  key: string;
  label: string;
  className?: string;
};

type DataTableProps = {
  columns: Column[];
  rows: ReactNode[][];
  emptyMessage?: string;
};

export function DataTable({ columns, rows, emptyMessage = "No data." }: DataTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-800">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-700 uppercase">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((cells, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {cells.map((cell, j) => (
                <td key={j} className={`px-4 py-3 ${columns[j]?.className ?? ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
