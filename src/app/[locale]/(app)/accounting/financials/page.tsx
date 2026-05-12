import { Link } from "@/i18n/navigation";
import { DEMO_FINANCIALS } from "@/lib/demo-data";

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; period?: string }>;
}) {
  const params = await searchParams;
  const type = params.type ?? "pl";

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
          <h1 className="text-2xl font-semibold text-slate-900">Financial statements</h1>
          <p className="text-sm text-slate-700">Posted entries only. KWD with 3 decimal places.</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Statement type">
          {types.map((t) => (
            <Link
              key={t.id}
              href={`/accounting/financials?type=${t.id}`}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                t.id === type
                  ? "border-orange-500 bg-orange-50 text-orange-800"
                  : "cursor-pointer border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {String(stmt.statement_type).toUpperCase()} — {stmt.period}
          </h2>
          <span className="text-xs text-slate-600">
            Generated {new Date(stmt.generated_at).toLocaleString()}
          </span>
        </header>
        <table className="w-full text-sm">
          <tbody>
            {stmt.line_items.map((row, i) => (
              <tr
                key={i}
                className={`border-t border-slate-100 ${row.label.startsWith("---") ? "bg-slate-50 font-semibold" : ""}`}
              >
                <td className="py-2">{row.label.replace(/-/g, "")}</td>
                <td className="py-2 text-right tabular-nums">{row.formatted}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Object.entries(stmt.formatted_totals).map(([k, v]) => (
              <tr key={k} className="border-t-2 border-slate-300 font-semibold">
                <td className="py-2">{k}</td>
                <td className="py-2 text-right tabular-nums">{v}</td>
              </tr>
            ))}
          </tfoot>
        </table>
        {stmt.notes && stmt.notes.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-slate-600">
            {stmt.notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
