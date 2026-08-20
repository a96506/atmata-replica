import { Link } from "@/i18n/navigation";
import { DemoStartSession } from "./demo-start";
import { ReconTabs } from "./recon-tabs";
import { listBankStatements } from "@/lib/api/reconciliation";
import { Empty } from "@/components/state/Empty";

export default async function ReconciliationPage() {
  const statements = await listBankStatements().catch(() => []);
  const active = statements.filter((s) => s.status !== "reconciled");

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

      {active.length === 0 ? (
        <Empty
          title="No open statements"
          description="Import a bank statement to start a reconciliation workspace."
        />
      ) : (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Bank statements
          </h2>
          <ul className="space-y-2">
            {active.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {s.number}
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      {s.status}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()}
                    {s.periodStart || s.periodEnd
                      ? ` · ${s.periodStart ?? "?"} → ${s.periodEnd ?? "?"}`
                      : null}
                  </p>
                </div>
                <Link
                  href={`/accounting/reconciliation/${s.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
