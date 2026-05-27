import { Link } from "@/i18n/navigation";
import { DemoStartSession } from "./demo-start";
import { ReconTabs } from "./recon-tabs";
import { DEMO_INBOX } from "@/lib/demo-data";

export default function ReconciliationPage() {
  const activeSessions = DEMO_INBOX.items.filter((i) => i.source === "reconciliation");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Bank Reconciliation</h1>
        <p className="text-sm text-slate-700">
          Import a bank statement, define matching rules, and accept suggested matches against open bills and invoices.
        </p>
      </header>

      <ReconTabs />

      <DemoStartSession />

      {activeSessions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Active sessions</h2>
          <ul className="space-y-2">
            {activeSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{s.title}</p>
                  <p className="text-xs text-slate-600">{new Date(s.created_at).toLocaleString()}</p>
                </div>
                <Link
                  href={`/accounting/reconciliation/${s.id}`}
                  className="text-sm font-medium text-orange-600 hover:underline"
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
