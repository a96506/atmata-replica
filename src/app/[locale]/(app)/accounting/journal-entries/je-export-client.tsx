"use client";

import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import type { JournalEntry } from "@/types";

/** Client island: CSV column accessors stay off the RSC boundary. */
export function JeExportClient({ rows }: { rows: JournalEntry[] }) {
  return (
    <ExportCsvButton
      rows={rows}
      filename="journal-entries"
      columns={[
        { label: "Number", value: (j) => j.number },
        { label: "Date", value: (j) => j.date },
        { label: "Description", value: (j) => j.description },
        { label: "Source type", value: (j) => j.sourceType },
        { label: "Source id", value: (j) => j.sourceId },
        {
          label: "Amount",
          value: (j) => j.lines.reduce((s, l) => s + l.debit, 0),
        },
        { label: "Currency", value: (j) => j.currency },
        { label: "State", value: (j) => j.state },
      ]}
    />
  );
}
