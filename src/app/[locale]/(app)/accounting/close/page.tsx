import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listFiscalPeriods } from "@/lib/api/master";
import { getPeriodCloseForFiscalPeriod } from "@/lib/api/period-close";
import { getReadClient } from "@/lib/db/read";
import { Empty } from "@/components/state/Empty";
import { pageMetadata } from "@/lib/metadata";
import {
  CloseDemoToolbar,
  CloseRescanDemo,
  CloseStepDemo,
} from "./close-demo-actions";
import type { FiscalPeriod } from "@/types";

export const generateMetadata = pageMetadata("accounting.closePage", "title");

const STEP_KEYS: string[] = [
  "reconcile_bank",
  "review_stale_drafts",
  "unbilled_deliveries",
  "missing_vendor_bills",
  "uninvoiced_revenue",
  "depreciation_entries",
  "tax_validation",
  "intercompany_balances",
  "review_adjustments",
  "final_review",
];

const STEP_HREF: Record<string, (locale: string) => string> = {
  reconcile_bank: (l) => `/${l}/accounting/reconciliation`,
  review_stale_drafts: (l) => `/${l}/accounting/journal-entries?state=draft`,
  // Accrue unbilled deliveries → post an accrual journal entry.
  unbilled_deliveries: (l) => `/${l}/accounting/journal-entries/new`,
  missing_vendor_bills: (l) => `/${l}/purchasing/goods-receipts?missingBill=1`,
  // Invoice unbilled revenue → start from deliveries missing an invoice.
  uninvoiced_revenue: (l) => `/${l}/sales/deliveries?missingBill=1`,
  depreciation_entries: (l) => `/${l}/accounting/journal-entries`,
  // Validate tax entries → review tax-bearing vendor bills.
  tax_validation: (l) => `/${l}/accounting/invoices`,
  intercompany_balances: (l) => `/${l}/accounting/journal-entries`,
  // Review manual adjustments → manual journal entries list.
  review_adjustments: (l) => `/${l}/accounting/journal-entries`,
  final_review: (l) => `/${l}/accounting/financials`,
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-muted text-foreground",
  running: "bg-status-info-muted text-status-info-foreground",
  blocked: "bg-status-pending-muted text-status-pending-foreground",
  needs_attention: "bg-status-pending-muted text-status-pending-foreground",
  completed: "bg-status-success-muted text-status-success-foreground",
  complete: "bg-status-success-muted text-status-success-foreground",
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

/** Roadmap / "not in v1" copy that leaks internal build state into the UI. */
const ROADMAP_NOTE_RE = /\bv1\b|intercompany model|not yet (implemented|available)|roadmap/i;

/**
 * Count the real documents in the period for each checklist step. A step is
 * `pending` until its query returns > 0, then `completed` when the user marks
 * it — never hard-coded `completed` or `skipped`.
 */
async function countPeriodDocsByCode(
  period: FiscalPeriod,
): Promise<Record<string, number>> {
  type Filter = {
    table: string;
    states?: string[];
    extra?: Record<string, string>;
  };
  const byCode: Record<string, Filter[]> = {
    reconcile_bank: [{ table: "journal_entries", states: ["posted"] }],
    review_stale_drafts: [
      { table: "journal_entries", states: ["draft"] },
      { table: "vendor_bills", states: ["draft"] },
      { table: "customer_invoices", states: ["draft"] },
    ],
    unbilled_deliveries: [{ table: "delivery_notes", states: ["posted"] }],
    missing_vendor_bills: [{ table: "goods_receipts", states: ["posted"] }],
    uninvoiced_revenue: [{ table: "delivery_notes", states: ["posted"] }],
    depreciation_entries: [
      { table: "journal_entries", states: ["posted"], extra: { source_type: "manual" } },
    ],
    tax_validation: [
      { table: "customer_invoices", states: ["posted"] },
      { table: "vendor_bills", states: ["posted"] },
    ],
    intercompany_balances: [],
    review_adjustments: [
      { table: "journal_entries", states: ["posted"], extra: { source_type: "manual" } },
    ],
    final_review: [
      { table: "journal_entries", states: ["posted"] },
      { table: "customer_invoices", states: ["posted"] },
      { table: "vendor_bills", states: ["posted"] },
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = await getReadClient();
  const run = async (f: Filter): Promise<number> => {
    let q = client.database
      .from(f.table)
      .select("id", { count: "exact", head: true })
      .gte("date", period.start)
      .lte("date", period.end);
    if (f.states && f.states.length > 0) q = q.in("state", f.states);
    if (f.extra) for (const [col, val] of Object.entries(f.extra)) q = q.eq(col, val);
    const result = await q;
    if (result.error || typeof result.count !== "number") return 0;
    return result.count as number;
  };

  const entries = Object.entries(byCode);
  const results = await Promise.all(
    entries.map(async ([code, filters]) => {
      const total = await Promise.all(filters.map(run)).then((nums) =>
        nums.reduce((a, b) => a + b, 0),
      );
      return [code, total] as const;
    }),
  );
  return Object.fromEntries(results);
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
  const t = await getTranslations("accounting.closePage");

  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const fiscalPeriods = await listFiscalPeriods().catch(() => []);
  const fiscalPeriod =
    fiscalPeriods.find((p) => p.year === year && p.month === month) ?? null;
  const fiscalPeriodId = fiscalPeriod?.id ?? null;

  const [workspace, counts] = await Promise.all([
    fiscalPeriodId != null
      ? getPeriodCloseForFiscalPeriod(fiscalPeriodId).catch(() => null)
      : Promise.resolve(null),
    fiscalPeriod
      ? countPeriodDocsByCode(fiscalPeriod).catch(() => ({} as Record<string, number>))
      : Promise.resolve({} as Record<string, number>),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("title")}
          </h1>
          <p className="text-sm text-foreground">
            {t("subtitle")}
            {!fiscalPeriodId ? (
              <span className="ms-1 text-muted-foreground">
                {t("noFiscalPeriod", { period })}
              </span>
            ) : null}
          </p>
        </div>
        <CloseDemoToolbar period={period} fiscalPeriodId={fiscalPeriodId} />
      </header>

      {!workspace ? (
        <Empty
          title={t("noRunTitle")}
          description={
            fiscalPeriodId
              ? t("noRunBodyWithPeriod")
              : t("noRunBodyNoPeriod", { period })
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{t("period")}</p>
              <p className="text-lg font-semibold text-foreground">{period}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{t("status")}</p>
              <p className="text-lg font-semibold capitalize text-foreground">
                {workspace.run.status.replace("_", " ")}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{t("progress")}</p>
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
              title={t("noTasksTitle")}
              description={t("noTasksBody")}
            />
          ) : (
            <div className="space-y-2">
              {workspace.tasks.map((task) => {
                const realFound = counts[task.code] ?? detailCount(task.detail, "itemsFound");
                const itemsResolved = detailCount(task.detail, "itemsResolved");
                const rawNotes =
                  typeof task.detail.reason === "string"
                    ? task.detail.reason
                    : typeof task.detail.notes === "string"
                      ? task.detail.notes
                      : null;
                const notes =
                  rawNotes && !ROADMAP_NOTE_RE.test(rawNotes) ? rawNotes : null;

                // Derive step state from real data: pending until the period
                // has documents to review, then completed when the user marks
                // it. Never trust a hard-coded `completed`/`skipped` for a step
                // with nothing to review.
                const userMarkedComplete = task.status === "completed";
                const displayStatus =
                  userMarkedComplete && realFound > 0 ? "completed" : "pending";
                const canComplete = !userMarkedComplete && realFound > 0;
                const stepLabel = STEP_KEYS.includes(task.code)
                  ? t(`steps.${task.code}`)
                  : task.name;

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
                          {stepLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {realFound} {t("found")} · {itemsResolved} {t("resolved")}
                          {notes ? <> · {notes}</> : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[displayStatus] ?? "bg-muted text-foreground"
                        }`}
                      >
                        {displayStatus}
                      </span>
                      {STEP_HREF[task.code] ? (
                        <Link
                          href={STEP_HREF[task.code](locale)}
                          className="cursor-pointer rounded-md border border-input bg-card px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          {t("openList")}
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
