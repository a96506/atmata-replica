import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable, type Column } from "@/components/data-table";
import { listDocumentSequences } from "@/lib/api/master";

const COLUMNS: Column[] = [
  { key: "doc", label: "Doc type" },
  { key: "prefix", label: "Prefix" },
  { key: "year", label: "Year" },
  { key: "pad", label: "Padding" },
  { key: "next", label: "Next number" },
  { key: "preview", label: "Format" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  void locale;
  const rows = await listDocumentSequences();

  const tableRows = rows.map((s) => {
    const padded = String(s.nextNumber).padStart(s.padding, "0");
    const preview = `${s.prefix}-${s.year}-${padded}`;
    return [
      s.docType,
      s.prefix,
      String(s.year),
      String(s.padding),
      <span key="next" className="font-mono text-xs tabular-nums">
        {s.nextNumber}
      </span>,
      <span key="preview" className="font-mono text-xs text-muted-foreground">
        {preview}
      </span>,
    ];
  });

  return (
    <DocumentList
      title="Document sequences"
      subtitle="Per doc-type prefix and format. The next number is issued by the backend on post."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No document sequences configured for this tenant yet.
        </p>
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={tableRows}
          emptyMessage="No document sequences configured."
        />
      )}
      <p className="text-xs text-muted-foreground">
        Note: the table stores the next number to be issued, not a historical
        “last used” value. Numbers are assigned server-side when a document is
        posted.
      </p>
    </DocumentList>
  );
}
