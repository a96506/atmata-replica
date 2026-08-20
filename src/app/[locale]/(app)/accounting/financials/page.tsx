import { Link } from "@/i18n/navigation";
import { DEMO_FINANCIALS } from "@/lib/demo-data";
import { DocPdfActions } from "@/components/doc/DocPdfActions";
import { listFiscalPeriods } from "@/lib/api/master";
import type { FinancialPdfType } from "@/types/functions";

export default async function FinancialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; period?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const type = query.type ?? "pl";
  const periods = await listFiscalPeriods();
  const periodId = query.period ?? periods.at(-1)?.id;
  const financialType: FinancialPdfType =
    type === "balance-sheet"
      ? "balance_sheet"
      : type === "cash-flow"
        ? "cash_flow"
        : type === "trial-balance"
          ? "trial_balance"
          : "pl";

  const types = [
    { id: "pl", label: "P&L" },
    { id: "balance-sheet", label: "Balance sheet" },
    { id: "cash-flow", label: "Cash flow" },
    { id: "trial-balance", label: "Trial balance" },
  ];

  const stmt = { ...DEMO_FINANCIALS, statement_type: type === "pl" ? "Profit & Loss" : type };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Financial statements</h1>
          <p className="text-sm text-foreground">Posted entries only. KWD with 3 decimal places.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {periodId ? (
          <DocPdfActions
            docType="financial"
            financialType={financialType}
            periodId={periodId}
            locale={locale}
          />
        ) : null}
        <nav className="flex flex-wrap gap-2" aria-label="Statement type">
          {types.map((t) => (
            <Link
              key={t.id}
              href={`/accounting/financials?type=${t.id}`}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                t.id === type
                  ? "border-primary bg-primary/10 text-primary"
                  : "cursor-pointer border-input bg-card text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {String(stmt.statement_type).toUpperCase()} — {stmt.period}
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
    </div>
  );
}
