import { Link } from "@/i18n/navigation";
import { DemoStartSession } from "./demo-start";
import { ReconTabs } from "./recon-tabs";
import { listBankStatementsPage } from "@/lib/api/reconciliation";
import { parseListPage } from "@/lib/list-paging";
import { DataTable } from "@/components/data-table";
import { Empty } from "@/components/state/Empty";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const { page, limit, offset } = parseListPage(sp);
  const { items: statements, total } = await listBankStatementsPage({
    limit,
    offset,
    openOnly: true,
  }).catch(() => ({ items: [], total: 0, limit, offset }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">
          Bank Reconciliation
        </h1>
        <p className="text-sm text-foreground">
          Import a bank statement, define matching rules, and accept suggested
          matches against open bills and invoices.
        </p>
      </header>

      <ReconTabs />

      <DemoStartSession />

      {statements.length === 0 && page <= 1 ? (
        <Empty
          title="No open statements"
          description="Import a bank statement to start a reconciliation workspace."
        />
      ) : (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Bank statements
          </h2>
          <DataTable
            columns={[
              { key: "number", label: "Number" },
              { key: "status", label: "Status" },
              { key: "period", label: "Period" },
              { key: "created", label: "Created" },
              { key: "open", label: "", className: "text-right" },
            ]}
            rows={statements.map((s) => [
              <span key="n" className="font-medium text-foreground">
                {s.number}
              </span>,
              <span key="st" className="text-xs text-muted-foreground">
                {s.status}
              </span>,
              <span key="p" className="text-xs text-muted-foreground">
                {s.periodStart || s.periodEnd
                  ? `${s.periodStart ?? "?"} → ${s.periodEnd ?? "?"}`
                  : "—"}
              </span>,
              <span key="c" className="text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleString()}
              </span>,
              <Link
                key="o"
                href={`/accounting/reconciliation/${s.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open
              </Link>,
            ])}
            emptyMessage="No open statements."
            serverPagination={{ page, pageSize: limit, total }}
          />
        </div>
      )}
    </div>
  );
}
