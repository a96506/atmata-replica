import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listAccounts } from "@/lib/api/gl";

const TYPE_ORDER: Record<string, number> = {
  asset: 1,
  liability: 2,
  equity: 3,
  revenue: 4,
  expense: 5,
};

export default async function Page() {
  const accounts = await listAccounts();
  const rows = accounts.slice().sort((a, b) => {
    const t = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (t !== 0) return t;
    return a.code.localeCompare(b.code);
  });

  // The accounts table has a single `name` column. Some seeded rows (e.g. 2400)
  // concatenated an AR translation into the same field. That is a data fix
  // (out of scope here) — surfaced as a note so the render stays clean.
  const bilingual = accounts.filter((a) => /[\u0600-\u06FF]/.test(a.name));

  return (
    <DocumentList
      title="Chart of accounts"
      subtitle="Account tree by class. Used by every posted document to write its journal entry."
    >
      {bilingual.length > 0 ? (
        <div className="rounded-md border border-status-pending-border bg-status-pending-muted p-2 text-xs text-status-pending-foreground">
          Note: {bilingual.length} account name(s) contain mixed-language text
          (EN + AR in one field): {bilingual.map((a) => a.code).join(", ")}. This
          is a seed-data issue to be cleaned up in a separate migration; the
          table stores a single name column.
        </div>
      ) : null}
      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
        ]}
        rows={rows.map((a) => [
          <span key="c" className="font-mono text-xs">
            {a.code}
          </span>,
          a.name,
          <span
            key="t"
            className={
              "rounded-full px-2 py-0.5 text-xs font-medium " +
              (a.type === "asset"
                ? "bg-status-success-muted text-status-success-foreground"
                : a.type === "liability"
                  ? "bg-status-danger-muted text-destructive"
                  : a.type === "equity"
                    ? "bg-status-info-muted text-status-info-foreground"
                    : a.type === "revenue"
                      ? "bg-status-info-muted text-status-info-foreground"
                      : "bg-status-pending-muted text-status-pending-foreground")
            }
          >
            {a.type}
          </span>,
        ])}
      />
    </DocumentList>
  );
}
