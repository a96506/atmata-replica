import { formatMoney } from "@/lib/money";
import {
  DataReadError,
  getReadClient,
  rpcData,
  rpcRows,
} from "@/lib/db/read";
import type { Currency, LocaleCode } from "@/types";
import { getCompany, listCompanies, listFiscalPeriods } from "@/lib/api/master";

export type ReportLineItem = { label: string; amount: number };

export type ReportPayload = {
  lineItems: ReportLineItem[];
  totals: Record<string, number>;
  /** Company base currency from report RPCs when present. */
  currency?: string;
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
  /** False when trial balance is unfiltered (no period query param). */
  period_filter_applied?: boolean;
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
    currency: raw?.currency != null ? String(raw.currency) : undefined,
  };
}

const KNOWN_CURRENCIES = new Set<Currency>(["KWD", "SAR", "AED", "USD"]);

function asCurrency(value: string | null | undefined): Currency | null {
  if (!value) return null;
  const upper = value.toUpperCase() as Currency;
  return KNOWN_CURRENCIES.has(upper) ? upper : null;
}

async function resolveDisplayCurrency(opts: {
  rpcCurrency?: string;
  companyId?: string;
}): Promise<Currency> {
  const fromRpc = asCurrency(opts.rpcCurrency);
  if (fromRpc) return fromRpc;
  if (opts.companyId) {
    const company = await getCompany(opts.companyId).catch(() => null);
    const fromCompany = asCurrency(company?.baseCurrency);
    if (fromCompany) return fromCompany;
  }
  const companies = await listCompanies().catch(() => []);
  return asCurrency(companies[0]?.baseCurrency) ?? "KWD";
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


export type GeneralLedgerRow = {
  journalEntryId: string;
  journalNumber: string;
  entryDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  lineDescription: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export async function getGeneralLedgerReport(opts: {
  periodId?: string;
  accountId?: string;
  from?: string;
  to?: string;
}): Promise<GeneralLedgerRow[]> {
  const params: Record<string, string> = {};
  if (opts.periodId) params.p_period_id = opts.periodId;
  if (opts.accountId) params.p_account_id = opts.accountId;
  if (opts.from) params.p_from = opts.from;
  if (opts.to) params.p_to = opts.to;
  const rows = await rpcRows<GeneralLedgerRow>(
    "report_general_ledger",
    params,
  );
  return rows.map((row) => ({
    journalEntryId: String(row.journalEntryId ?? ""),
    journalNumber: String(row.journalNumber ?? ""),
    entryDate: String(row.entryDate ?? ""),
    accountId: String(row.accountId ?? ""),
    accountCode: String(row.accountCode ?? ""),
    accountName: String(row.accountName ?? ""),
    lineDescription: String(row.lineDescription ?? ""),
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    runningBalance: Number(row.runningBalance ?? 0),
  }));
}

export type TrialBalanceFilters = {
  periodId?: string;
  accountId?: string;
  from?: string;
  to?: string;
};

export async function getReportTrialBalance(
  filters: TrialBalanceFilters = {},
): Promise<ReportPayload> {
  type TbRow = {
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    balance: number;
  };
  const args: Record<string, unknown> = {};
  if (filters.periodId) args.p_period_id = filters.periodId;
  if (filters.accountId) args.p_account_id = filters.accountId;
  if (filters.from) args.p_from = filters.from;
  if (filters.to) args.p_to = filters.to;
  const rows = await rpcRows<TbRow>("report_trial_balance", args);
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
    notes: [
      "Posted entries only.",
      `${currency} amounts in company base currency.`,
    ],
  };
}

export async function getFinancialStatement(opts: {
  type: "pl" | "balance-sheet" | "cash-flow" | "trial-balance";
  periodId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  locale: LocaleCode;
}): Promise<FinancialStatementView | null> {
  const periods = await listFiscalPeriods();
  const period =
    opts.type === "trial-balance"
      ? opts.periodId
        ? periods.find((p) => p.id === opts.periodId)
        : undefined
      : ((opts.periodId
          ? periods.find((p) => p.id === opts.periodId)
          : undefined) ?? periods[0]);
  if (!period && opts.type !== "trial-balance") return null;

  const label = period ? periodLabel(period.year, period.month) : "—";

  try {
    if (opts.type === "pl") {
      if (!period) return null;
      const payload = await getReportPnL(period.id);
      const currency = await resolveDisplayCurrency({
        rpcCurrency: payload.currency,
        companyId: period.companyId,
      });
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
      const currency = await resolveDisplayCurrency({
        rpcCurrency: payload.currency,
        companyId: period.companyId,
      });
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
      const currency = await resolveDisplayCurrency({
        rpcCurrency: payload.currency,
        companyId: period.companyId,
      });
      return formatStatement(
        "Cash Flow",
        label,
        currency,
        opts.locale,
        payload,
        [{ key: "ending", label: "Ending cash" }],
      );
    }
    const tbFilters: TrialBalanceFilters = {
      periodId: period?.id,
      accountId: opts.accountId,
      from: opts.from,
      to: opts.to,
    };
    const payload = await getReportTrialBalance(tbFilters);
    const currency = await resolveDisplayCurrency({
      rpcCurrency: payload.currency,
      companyId: period?.companyId,
    });
    const filterParts: string[] = [];
    if (period) filterParts.push(label);
    if (opts.from || opts.to) {
      filterParts.push(`${opts.from ?? "…"} → ${opts.to ?? "…"}`);
    }
    const tbLabel =
      filterParts.length > 0 ? filterParts.join(" · ") : "All posted periods";
    const stmt = formatStatement(
      "Trial Balance",
      tbLabel,
      currency,
      opts.locale,
      payload,
      [
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
      ],
    );
    const filtersApplied = !!(
      period ||
      opts.accountId ||
      opts.from ||
      opts.to
    );
    return { ...stmt, period_filter_applied: filtersApplied };
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

/**
 * The fiscal period that contains today's date. Falls back to `pickLatestPeriodId`
 * when today isn't covered by any period (e.g. calendar not yet seeded). Used as the
 * default for financial statements so they open on the current month, not a future
 * one.
 */
export function pickCurrentPeriodId(
  periods: Array<{ id: string; start: string; end: string; status: string }>,
): string | undefined {
  const now = Date.now();
  const current = periods.find(
    (p) =>
      new Date(p.start).getTime() <= now && new Date(p.end).getTime() >= now,
  );
  return current?.id ?? pickLatestPeriodId(periods);
}

export async function getDashboardOverview(): Promise<{
  cfo: DashboardCfoView;
  stats: DashboardStatsView;
  periodId: string | undefined;
}> {
  const periods = await listFiscalPeriods();
  const periodId = pickCurrentPeriodId(periods);
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
