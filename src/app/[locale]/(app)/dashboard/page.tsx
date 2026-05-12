import { getLocale, getTranslations } from "next-intl/server";
import { formatKwd } from "@/lib/utils";
import { DEMO_CFO, DEMO_STATS } from "@/lib/demo-data";

function KpiCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <p className="text-xs tracking-wide text-slate-600 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {delta !== undefined && (
        <p className={`mt-1 text-xs ${delta >= 0 ? "text-green-600" : "text-red-600"}`}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}% vs last month
        </p>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const lk = locale === "ar" ? "ar" : "en";
  const stats = DEMO_STATS;
  const cfo = DEMO_CFO;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-700">{t("subtitle")}</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("kpiCash")}
          value={formatKwd(cfo.cash_position.current, lk)}
        />
        <KpiCard
          label={t("kpiRevenue")}
          value={formatKwd(cfo.revenue.mtd, lk)}
          delta={cfo.revenue.vs_last_month}
        />
        <KpiCard label={t("kpiPending")} value={String(stats.pending_approvals ?? 0)} />
        <KpiCard
          label={t("kpiSuccess")}
          value={
            stats.success_rate !== undefined
              ? `${(stats.success_rate * 100).toFixed(1)}%`
              : "—"
          }
        />
      </section>

      {cfo.ar_aging.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("arAging")}</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-600 uppercase">
              <tr>
                <th className="py-2">Bucket</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {cfo.ar_aging.map((row) => (
                <tr key={row.bucket} className="border-t border-slate-100">
                  <td className="py-2">{row.bucket}</td>
                  <td className="py-2 text-right tabular-nums">{formatKwd(row.amount, lk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {cfo.alerts.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t("alerts")}</h2>
          <ul className="mt-3 space-y-2">
            {cfo.alerts.map((a, i) => (
              <li key={i} className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
                <span className="font-medium">{a.severity}:</span> {a.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
