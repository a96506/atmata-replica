import { DEMO_CLOSING } from "@/lib/demo-data";
import { CloseDemoToolbar, CloseRescanDemo, CloseStepDemo } from "./close-demo-actions";

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

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-800",
  needs_attention: "bg-amber-100 text-amber-800",
  complete: "bg-green-100 text-green-800",
};

function defaultPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period = periodParam || defaultPeriod();
  const closing = DEMO_CLOSING.period === period ? DEMO_CLOSING : { ...DEMO_CLOSING, period };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Month-End Close</h1>
          <p className="text-sm text-slate-700">10-step AI-assisted closing checklist.</p>
        </div>
        <CloseDemoToolbar period={period} />
      </header>

      {closing && (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm text-slate-600">Period</p>
              <p className="text-lg font-semibold text-slate-900">{closing.period}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-600">Status</p>
              <p className="text-lg font-semibold capitalize text-slate-900">{closing.status}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-600">Progress</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-orange-500 transition-all duration-300"
                    style={{ width: `${closing.overall_progress_pct}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-900">
                  {closing.overall_progress_pct.toFixed(0)}%
                </span>
              </div>
            </div>
            <CloseRescanDemo period={period} />
          </div>

          {closing.summary && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 font-semibold text-slate-900">AI Summary</h2>
              <p className="text-sm text-slate-800">{closing.summary}</p>
            </div>
          )}

          <div className="space-y-2">
            {closing.steps
              .slice()
              .sort((a, b) => a.step_order - b.step_order)
              .map((step) => (
                <div
                  key={step.step_name}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-800">
                      {step.step_order}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {STEP_LABELS[step.step_name] ?? step.step_name}
                      </p>
                      <p className="text-xs text-slate-600">
                        {step.items_found} found · {step.items_resolved} resolved
                        {step.notes && <> · {step.notes}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[step.status] ?? "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {step.status.replace("_", " ")}
                    </span>
                    {step.status !== "complete" && (
                      <CloseStepDemo period={period} stepName={step.step_name} />
                    )}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
