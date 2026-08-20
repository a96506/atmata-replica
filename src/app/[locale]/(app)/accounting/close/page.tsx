import Link from "next/link";
import { listFiscalPeriods } from "@/lib/api/master";
import { getPeriodCloseForFiscalPeriod } from "@/lib/api/period-close";
import { Empty } from "@/components/state/Empty";
import {
  CloseDemoToolbar,
  CloseRescanDemo,
  CloseStepDemo,
} from "./close-demo-actions";

const STEP_LABELS: Record<string, string> = {
  reconcile_bank: "Reconcile Bank Transactions",
  review_stale_drafts: "Review Stale Draft Entries",
  unbilled_deliveries: "Accrue Unbilled Deliveries",
  missing_vendor_bills: "Check Missing Vendor Bills",
  uninvoiced_revenue: "Invoice Unbilled Revenue",
  depreciation_entries: "Post Depreciation Entries",
  tax_validation: "Validate Tax Entries",
  intercompany_balances: "Review Inter-Company Balances",
  review_adjustments: "Review Manual Adjustments",
  final_review: "Final P&L / Balance Sheet Review",
};

const STEP_HREF: Record<string, (locale: string) => string> = {
  reconcile_bank: (l) => `/${l}/accounting/reconciliation`,
  review_stale_drafts: (l) => `/${l}/accounting/journal-entries?state=draft`,
  unbilled_deliveries: (l) => `/${l}/sales/deliveries?missingBill=1`,
  missing_vendor_bills: (l) => `/${l}/purchasing/goods-receipts?missingBill=1`,
  uninvoiced_revenue: (l) => `/${l}/sales/deliveries?missingBill=1`,
  depreciation_entries: (l) => `/${l}/accounting/journal-entries`,
  tax_validation: (l) => `/${l}/settings/tax-codes`,
  intercompany_balances: (l) => `/${l}/accounting/journal-entries`,
  review_adjustments: (l) => `/${l}/inventory/adjustments`,
  final_review: (l) => `/${l}/accounting/financials`,
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-muted text-foreground",
  running: "bg-status-info-muted text-status-info-foreground",
  blocked: "bg-status-pending-muted text-status-pending-foreground",
  needs_attention: "bg-status-pending-muted text-status-pending-foreground",
  completed: "bg-status-success-muted text-status-success-foreground",
  complete: "bg-status-success-muted text-status-success-foreground",
  skipped: "bg-muted text-muted-foreground",
};

function defaultPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function detailCount(
  detail: Record<string, unknown>,
  key: string,
): number {
  const value = detail[key];
  return typeof value === "number" ? value : 0;
}

export default async function ClosePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const { period: periodParam } = await searchParams;
  const period = periodParam || defaultPeriod();

  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const fiscalPeriods = await listFiscalPeriods().catch(() => []);
  const fiscalPeriod =
    fiscalPeriods.find((p) => p.year === year && p.month === month) ?? null;
  const fiscalPeriodId = fiscalPeriod?.id ?? null;

  const workspace =
    fiscalPeriodId != null
      ? await getPeriodCloseForFiscalPeriod(fiscalPeriodId).catch(() => null)
      : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Month-End Close
          </h1>
          <p className="text-sm text-foreground">
            10-step AI-assisted closing checklist.
            {!fiscalPeriodId ? (
              <span className="ms-1 text-muted-foreground">
                (No fiscal period row for {period} — start/rescan disabled.)
              </span>
            ) : null}
          </p>
        </div>
        <CloseDemoToolbar period={period} fiscalPeriodId={fiscalPeriodId} />
      </header>

      {!workspace ? (
        <Empty
          title="No close run for this period"
          description={
            fiscalPeriodId
              ? "Click Run close to create the period close run and tasks."
              : `Create a fiscal period for ${period} first.`
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Period</p>
              <p className="text-lg font-semibold text-foreground">{period}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold capitalize text-foreground">
                {workspace.run.status.replace("_", " ")}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Progress</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${workspace.overallProgressPct}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {workspace.overallProgressPct.toFixed(0)}%
                </span>
              </div>
            </div>
            <CloseRescanDemo period={period} fiscalPeriodId={fiscalPeriodId} />
          </div>

          {workspace.tasks.length === 0 ? (
            <Empty
              title="No close tasks"
              description="Re-scan to ensure canonical period_close_tasks exist for this run."
            />
          ) : (
            <div className="space-y-2">
              {workspace.tasks.map((task) => {
                const itemsFound = detailCount(task.detail, "itemsFound");
                const itemsResolved = detailCount(task.detail, "itemsResolved");
                const notes =
                  typeof task.detail.reason === "string"
                    ? task.detail.reason
                    : typeof task.detail.notes === "string"
                      ? task.detail.notes
                      : null;
                const canComplete =
                  task.status !== "completed" && task.status !== "skipped";

                return (
                  <div
                    key={task.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                        {task.sequence}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {STEP_LABELS[task.code] ?? task.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {itemsFound} found · {itemsResolved} resolved
                          {notes ? <> · {notes}</> : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[task.status] ??
                          "bg-muted text-foreground"
                        }`}
                      >
                        {task.status.replace("_", " ")}
                      </span>
                      {STEP_HREF[task.code] ? (
                        <Link
                          href={STEP_HREF[task.code](locale)}
                          className="cursor-pointer rounded-md border border-input bg-card px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          Open list →
                        </Link>
                      ) : null}
                      {canComplete ? (
                        <CloseStepDemo
                          period={period}
                          stepName={task.code}
                          taskId={task.id}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
