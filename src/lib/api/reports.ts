import { formatMoney } from "@/lib/money";
import {
  DataReadError,
  getReadClient,
  rpcData,
  rpcRows,
} from "@/lib/db/read";
import type { Currency, LocaleCode } from "@/types";
import { listFiscalPeriods } from "@/lib/api/master";

export type ReportLineItem = { label: string; amount: number };

export type ReportPayload = {
  lineItems: ReportLineItem[];
  totals: Record<string, number>;
};

export type AgingInvoiceRow = {
  customerId: string;
  customerName: string;
  outstanding: number;
  currentAmount: number;
  days130: number;
  days3160: number;
  days6190: number;
  daysOver90: number;
};

export type AgingBucket = { bucket: string; amount: number };

export type FinancialStatementView = {
  statement_type: string;
  period: string;
  currency: string;
  line_items: Array<{ label: string; amount: number; formatted: string }>;
  formatted_totals: Record<string, string>;
  totals: Record<string, number>;
  generated_at: string;
  notes: string[];
};

const SUBTOTAL_LABELS = new Set([
  "Gross profit",
  "Operating income",
  "Net income",
  "Total assets",
  "Total liabilities",
  "Total equity",
  "Total liabilities and equity",
  "Ending cash",
]);

function asReportPayload(raw: ReportPayload | null | undefined): ReportPayload {
  return {
    lineItems: (raw?.lineItems ?? []).map((row) => ({
      label: String(row.label ?? ""),
      amount: Number(row.amount ?? 0),
    })),
    totals: Object.fromEntries(
      Object.entries(raw?.totals ?? {}).map(([k, v]) => [k, Number(v ?? 0)]),
    ),
  };
}

export async function getReportPnL(periodId: string): Promise<ReportPayload> {
  return asReportPayload(
    await rpcData<ReportPayload>("report_pnl", { p_period_id: periodId }),
  );
}

export async function getReportBalanceSheet(
  periodId: string,
): Promise<ReportPayload> {
  return asReportPayload(
    await rpcData<ReportPayload>("report_balance_sheet", {
      p_period_id: periodId,
    }),
  );
}

export async function getReportCashFlow(
  periodId: string,
): Promise<ReportPayload> {
  return asReportPayload(
    await rpcData<ReportPayload>("report_cash_flow", {
      p_period_id: periodId,
    }),
  );
}

export async function getReportTrialBalance(): Promise<ReportPayload> {
  type TbRow = {
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    balance: number;
  };
  const rows = await rpcRows<TbRow>("report_trial_balance", {});
  const lineItems = rows.map((row) => ({
    label: `${row.accountCode ?? ""} ${row.accountName ?? ""}`.trim(),
    amount: Number(row.balance ?? 0),
  }));
  const totals = {
    debit: rows.reduce((sum, row) => sum + Number(row.debit ?? 0), 0),
    credit: rows.reduce((sum, row) => sum + Number(row.credit ?? 0), 0),
  };
  return { lineItems, totals };
}

export async function listArAgingRows(): Promise<AgingInvoiceRow[]> {
  return rpcRows<AgingInvoiceRow>("report_ar_aging", {});
}

export async function getArAgingBuckets(): Promise<AgingBucket[]> {
  const rows = await listArAgingRows().catch(() => [] as AgingInvoiceRow[]);
  const buckets: AgingBucket[] = [
    { bucket: "0-30", amount: 0 },
    { bucket: "31-60", amount: 0 },
    { bucket: "61-90", amount: 0 },
    { bucket: "90+", amount: 0 },
  ];
  for (const row of rows) {
    buckets[0]!.amount +=
      Number(row.currentAmount ?? 0) + Number(row.days130 ?? 0);
    buckets[1]!.amount += Number(row.days3160 ?? 0);
    buckets[2]!.amount += Number(row.days6190 ?? 0);
    buckets[3]!.amount += Number(row.daysOver90 ?? 0);
  }
  return buckets;
}

function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatStatement(
  statementType: string,
  period: string,
  currency: Currency,
  locale: LocaleCode,
  payload: ReportPayload,
  totalKeys: Array<{ key: string; label: string }>,
): FinancialStatementView {
  const line_items = payload.lineItems.map((row) => {
    const isSub = SUBTOTAL_LABELS.has(row.label);
    const label = isSub ? `---${row.label}` : row.label;
    return {
      label,
      amount: row.amount,
      formatted: formatMoney(row.amount, currency, locale),
    };
  });
  const formatted_totals: Record<string, string> = {};
  const totals: Record<string, number> = {};
  for (const { key, label } of totalKeys) {
    const amount = Number(payload.totals[key] ?? 0);
    totals[key] = amount;
    formatted_totals[label] = formatMoney(amount, currency, locale);
  }
  return {
    statement_type: statementType,
    period,
    currency,
    line_items,
    formatted_totals,
    totals,
    generated_at: new Date().toISOString(),
    notes: ["Posted entries only.", "KWD, 3 decimal places."],
  };
}

export async function getFinancialStatement(opts: {
  type: "pl" | "balance-sheet" | "cash-flow" | "trial-balance";
  periodId?: string;
  locale: LocaleCode;
}): Promise<FinancialStatementView | null> {
  const periods = await listFiscalPeriods();
  const period =
    (opts.periodId
      ? periods.find((p) => p.id === opts.periodId)
      : undefined) ?? periods[0];
  if (!period && opts.type !== "trial-balance") return null;

  const label = period ? periodLabel(period.year, period.month) : "—";
  const currency: Currency = "KWD";

  try {
    if (opts.type === "pl") {
      if (!period) return null;
      const payload = await getReportPnL(period.id);
      return formatStatement(
        "Profit & Loss",
        label,
        currency,
        opts.locale,
        payload,
        [{ key: "netIncome", label: "Net income" }],
      );
    }
    if (opts.type === "balance-sheet") {
      if (!period) return null;
      const payload = await getReportBalanceSheet(period.id);
      return formatStatement(
        "Balance Sheet",
        label,
        currency,
        opts.locale,
        payload,
        [
          { key: "assets", label: "Assets" },
          { key: "totalLiabilitiesEquity", label: "Liabilities + equity" },
        ],
      );
    }
    if (opts.type === "cash-flow") {
      if (!period) return null;
      const payload = await getReportCashFlow(period.id);
      return formatStatement(
        "Cash Flow",
        label,
        currency,
        opts.locale,
        payload,
        [{ key: "ending", label: "Ending cash" }],
      );
    }
    const payload = await getReportTrialBalance();
    return formatStatement(
      "Trial Balance",
      label,
      currency,
      opts.locale,
      payload,
      [
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
      ],
    );
  } catch (err) {
    if (err instanceof DataReadError) throw err;
    throw err;
  }
}

export type DashboardCfoView = {
  cash_position: { current: number };
  revenue: { mtd: number; vs_last_month?: number };
  ar_aging: AgingBucket[];
  alerts: Array<{ severity: string; message: string }>;
};

export type DashboardStatsView = {
  pending_approvals: number;
  success_rate?: number;
};

/** Open period if any, else newest (listFiscalPeriods is year/month desc). */
export function pickLatestPeriodId(
  periods: Array<{ id: string; status: string }>,
): string | undefined {
  return periods.find((p) => p.status === "open")?.id ?? periods[0]?.id;
}

export async function getDashboardOverview(): Promise<{
  cfo: DashboardCfoView;
  stats: DashboardStatsView;
  periodId: string | undefined;
}> {
  const periods = await listFiscalPeriods();
  const periodId = pickLatestPeriodId(periods);
  const prevPeriod = periods.find((p) => p.id !== periodId);

  const emptyCfo: DashboardCfoView = {
    cash_position: { current: 0 },
    revenue: { mtd: 0 },
    ar_aging: [],
    alerts: [],
  };

  if (!periodId) {
    return {
      cfo: emptyCfo,
      stats: { pending_approvals: 0 },
      periodId: undefined,
    };
  }

  const [pnl, prevPnl, cash, arBuckets, pending, successRate] =
    await Promise.all([
      getReportPnL(periodId).catch(() => null),
      prevPeriod
        ? getReportPnL(prevPeriod.id).catch(() => null)
        : Promise.resolve(null),
      getReportCashFlow(periodId).catch(() => null),
      getArAgingBuckets().catch(() => [] as AgingBucket[]),
      countPendingApprovals().catch(() => 0),
      getAiSuccessRate().catch(() => undefined),
    ]);

  const mtd = Number(pnl?.totals.revenue ?? 0);
  const prevRev = Number(prevPnl?.totals.revenue ?? 0);
  const vs =
    prevPnl && prevRev !== 0
      ? ((mtd - prevRev) / Math.abs(prevRev)) * 100
      : undefined;

  const cashCurrent = Number(cash?.totals.ending ?? 0);

  const alerts: DashboardCfoView["alerts"] = [];
  const overdueAr = arBuckets
    .filter((b) => b.bucket !== "0-30")
    .reduce((s, b) => s + b.amount, 0);
  if (overdueAr > 0) {
    alerts.push({
      severity: "medium",
      message: `AR past 30 days: ${formatMoney(overdueAr, "KWD", "en")}.`,
    });
  }
  if (pending > 0) {
    alerts.push({
      severity: "low",
      message: `${pending} document(s) awaiting approval.`,
    });
  }

  return {
    cfo: {
      cash_position: { current: cashCurrent },
      revenue: { mtd, vs_last_month: vs },
      ar_aging: arBuckets.some((b) => b.amount !== 0) ? arBuckets : [],
      alerts,
    },
    stats: {
      pending_approvals: pending,
      ...(successRate !== undefined ? { success_rate: successRate } : {}),
    },
    periodId,
  };
}

async function countPendingApprovals(): Promise<number> {
  const client = await getReadClient();
  const tables = [
    "purchase_orders",
    "vendor_bills",
    "quotes",
    "sales_orders",
    "journal_entries",
  ] as const;
  const counts = await Promise.all(
    tables.map(async (table) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await client.database
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("state", "pending");
      if (result.error || typeof result.count !== "number") return 0;
      return result.count;
    }),
  );
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * AI success rate from `ai_queued_actions` terminal outcomes
 * (executed / (executed + failed)). Undefined when no terminal rows.
 */
async function getAiSuccessRate(): Promise<number | undefined> {
  const client = await getReadClient();
  const countStatus = async (status: "executed" | "failed") => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await client.database
      .from("ai_queued_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (result.error || typeof result.count !== "number") return 0;
    return result.count as number;
  };
  const [executed, failed] = await Promise.all([
    countStatus("executed"),
    countStatus("failed"),
  ]);
  const total = executed + failed;
  if (total === 0) return undefined;
  return executed / total;
}
