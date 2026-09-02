import { Link } from "@/i18n/navigation";
import { DocPdfActions } from "@/components/doc/DocPdfActions";
import {
  getFinancialStatement,
  getGeneralLedgerReport,
  pickCurrentPeriodId,
} from "@/lib/api/reports";
import { listCompanies, listFiscalPeriods } from "@/lib/api/master";
import type { Currency } from "@/types";
import { listAccounts } from "@/lib/api/gl";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/metadata";
import type { FinancialPdfType } from "@/types/functions";
import { getTranslations } from "next-intl/server";
import { FinancialPeriodSelect } from "./FinancialPeriodSelect";
import { TrialBalanceFilters } from "./TrialBalanceFilters";

export const generateMetadata = pageMetadata("nav", "financials");

function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function asCurrency(value: string | null | undefined): Currency | null {
  if (value === "KWD" || value === "SAR" || value === "AED" || value === "USD") {
    return value;
  }
  return null;
}

function tabHref(
  tabId: string,
  periodId?: string,
  accountId?: string,
  from?: string,
  to?: string,
): string {
  const params = new URLSearchParams({ type: tabId });
  if (periodId) params.set("period", periodId);
  if (tabId === "general-ledger" || tabId === "trial-balance") {
    if (accountId) params.set("account", accountId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }
  return `/accounting/financials?${params.toString()}`;
}

export default async function FinancialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; period?: string; account?: string; from?: string; to?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const type = query.type ?? "pl";
  const isTrialBalance = type === "trial-balance";
  const isGeneralLedger = type === "general-ledger";
  const t = await getTranslations("accounting.financialsPage");
  const lk = locale === "ar" ? "ar" : "en";
  const periods = await listFiscalPeriods();
  const companies = await listCompanies().catch(() => []);
  const periodId = query.period ?? pickCurrentPeriodId(periods);
  const trialBalancePeriodId = query.period;
  const accountId = query.account;
  const fromDate = query.from;
  const toDate = query.to;
  const pdfPeriodId = isTrialBalance ? trialBalancePeriodId : periodId;
  const hasTbFilters = Boolean(accountId || fromDate || toDate);
  const financialType: FinancialPdfType =
    type === "balance-sheet"
      ? "balance_sheet"
      : type === "cash-flow"
        ? "cash_flow"
        : type === "trial-balance"
          ? "trial_balance"
          : type === "general-ledger"
            ? "general_ledger"
            : "pl";
  const showFinancialPdf =
    isGeneralLedger
      ? Boolean(periodId)
      : isTrialBalance
        ? Boolean(pdfPeriodId || hasTbFilters)
        : Boolean(pdfPeriodId);

  const types = [
    { id: "pl", label: "P&L" },
    { id: "balance-sheet", label: "Balance sheet" },
    { id: "cash-flow", label: "Cash flow" },
    { id: "trial-balance", label: "Trial balance" },
    { id: "general-ledger", label: t("generalLedgerTab") },
  ];

  const statementType =
    type === "pl"
      ? "pl"
      : type === "balance-sheet"
        ? "balance-sheet"
        : type === "cash-flow"
          ? "cash-flow"
          : "trial-balance";

  const period = periods.find((p) => p.id === periodId);
  const periodDisplay = period ? periodLabel(period.year, period.month) : "—";

  const [stmt, glRows, accounts] = await Promise.all([
    isGeneralLedger
      ? Promise.resolve(null)
      : getFinancialStatement({
          type: statementType,
          periodId: isTrialBalance ? trialBalancePeriodId : periodId,
          accountId: isTrialBalance ? accountId : undefined,
          from: isTrialBalance ? fromDate : undefined,
          to: isTrialBalance ? toDate : undefined,
          locale: lk,
        }).catch(() => null),
    isGeneralLedger
      ? getGeneralLedgerReport({
          periodId: periodId ?? undefined,
          accountId: accountId ?? undefined,
          from: fromDate,
          to: toDate,
        }).catch(() => [])
      : Promise.resolve([]),
    isGeneralLedger || isTrialBalance
      ? listAccounts().catch(() => [])
      : Promise.resolve([]),
  ]);

  const periodCompanyId = period?.companyId ?? companies[0]?.id;
  const companyBase =
    (periodCompanyId
      ? companies.find((c) => c.id === periodCompanyId)?.baseCurrency
      : undefined) ?? companies[0]?.baseCurrency;
  const currency =
    asCurrency(stmt?.currency) ?? asCurrency(companyBase) ?? ("KWD" as Currency);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {showFinancialPdf ? (
          <DocPdfActions
            docType="financial"
            financialType={financialType}
            periodId={pdfPeriodId ?? ""}
            accountId={isTrialBalance || isGeneralLedger ? accountId : undefined}
            from={isTrialBalance || isGeneralLedger ? fromDate : undefined}
            to={isTrialBalance || isGeneralLedger ? toDate : undefined}
            locale={locale}
          />
        ) : null}
        <FinancialPeriodSelect
          locale={locale}
          type={type}
          periods={periods}
          currentPeriodId={isTrialBalance ? trialBalancePeriodId : periodId}
          accountId={isTrialBalance || isGeneralLedger ? accountId : undefined}
          fromDate={isTrialBalance || isGeneralLedger ? fromDate : undefined}
          toDate={isTrialBalance || isGeneralLedger ? toDate : undefined}
        />
        {isTrialBalance || isGeneralLedger ? (
          <TrialBalanceFilters
            locale={locale}
            type={type}
            accounts={accounts}
            periodId={isTrialBalance ? trialBalancePeriodId : periodId}
            accountId={accountId}
            fromDate={fromDate}
            toDate={toDate}
          />
        ) : null}
        <nav className="flex flex-wrap gap-2" aria-label="Statement type">
          {types.map((tab) => (
            <Link
              key={tab.id}
              href={tabHref(tab.id, periodId, accountId, fromDate, toDate)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                tab.id === type
                  ? "border-primary bg-primary/10 text-primary"
                  : "cursor-pointer border-input bg-card text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        </div>
      </header>

      {isTrialBalance && stmt?.period_filter_applied === false ? (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
        >
          {t("trialBalancePeriodBanner")}
        </div>
      ) : null}

      {isGeneralLedger ? (
        !periodId ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">{t("noPeriod")}</p>
          </section>
        ) : glRows.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">{t("generalLedgerEmpty")}</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {t("generalLedgerTitle")} — {periodDisplay}
              </h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pe-2">{t("colDate")}</th>
                    <th className="py-2 pe-2">{t("colJournal")}</th>
                    <th className="py-2 pe-2">{t("colAccount")}</th>
                    <th className="py-2 pe-2">{t("colDescription")}</th>
                    <th className="py-2 pe-2 text-right">{t("colDebit")}</th>
                    <th className="py-2 pe-2 text-right">{t("colCredit")}</th>
                    <th className="py-2 text-right">{t("colBalance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {glRows.map((row, i) => (
                    <tr key={`${row.journalEntryId}-${i}`} className="border-t border-border">
                      <td className="py-2 pe-2 tabular-nums">{row.entryDate}</td>
                      <td className="py-2 pe-2">
                        <Link
                          href={`/accounting/journal-entries/${row.journalEntryId}`}
                          className="text-primary hover:underline"
                        >
                          {row.journalNumber}
                        </Link>
                      </td>
                      <td className="py-2 pe-2">
                        {row.accountCode} {row.accountName}
                      </td>
                      <td className="py-2 pe-2 text-muted-foreground">
                        {row.lineDescription || "—"}
                      </td>
                      <td className="py-2 pe-2 text-right tabular-nums">
                        {row.debit ? formatMoney(row.debit, currency, lk) : "—"}
                      </td>
                      <td className="py-2 pe-2 text-right tabular-nums">
                        {row.credit ? formatMoney(row.credit, currency, lk) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(row.runningBalance, currency, lk)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : !stmt ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">{t("noStatement")}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {String(stmt.statement_type).toUpperCase()} —{" "}
              {stmt.period_filter_applied === false
                ? t("trialBalanceAllPeriods")
                : stmt.period}
            </h2>
            <span className="text-xs text-muted-foreground">
              Generated {new Date(stmt.generated_at).toLocaleString()}
            </span>
          </header>
          <table className="w-full text-sm">
            <tbody>
              {stmt.line_items.map((row, i) => (
                <tr
                  key={i}
                  className={`border-t border-border ${row.label.startsWith("---") ? "bg-muted/50 font-semibold" : ""}`}
                >
                  <td className="py-2">{row.label.replace(/-/g, "")}</td>
                  <td className="py-2 text-right tabular-nums">{row.formatted}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {Object.entries(stmt.formatted_totals).map(([k, v]) => (
                <tr key={k} className="border-t-2 border-input font-semibold">
                  <td className="py-2">{k}</td>
                  <td className="py-2 text-right tabular-nums">{v}</td>
                </tr>
              ))}
            </tfoot>
          </table>
          {stmt.notes && stmt.notes.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
              {stmt.notes.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
