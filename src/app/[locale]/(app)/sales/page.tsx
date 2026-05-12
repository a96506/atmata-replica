import { getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { DEMO_SALES } from "@/lib/demo-data";
import { formatKwd } from "@/lib/utils";
import { SalesQuickQuoteDemo } from "./sales-quick-quote-demo";

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs tracking-wide text-slate-600 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export default async function SalesPage() {
  const t = await getTranslations("sales");
  const locale = await getLocale();
  const lk = locale === "ar" ? "ar" : "en";
  const d = DEMO_SALES;

  const payBadge = (status: string) => {
    const tone =
      status === "current"
        ? "bg-green-100 text-green-900"
        : status === "overdue_14"
          ? "bg-amber-100 text-amber-950"
          : "bg-red-100 text-red-900";
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{t(`pay.${status}`)}</span>
    );
  };

  const scoreBadge = (score: string) => (
    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">{score}</span>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-700">{t("subtitle")}</p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label={t("kpiQuotes")} value={d.summary.pending_quotes} />
        <Kpi label={t("kpiOverdue")} value={d.summary.overdue_customers} />
        <Kpi label={t("kpiCreditHolds")} value={d.summary.credit_holds} />
      </section>

      {d.customers.some((c) => c.payment_status === "on_hold") && (
        <section
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950"
          role="status"
        >
          <p className="font-semibold">{t("creditBannerTitle")}</p>
          <ul className="mt-2 list-inside list-disc">
            {d.customers
              .filter((c) => c.payment_status === "on_hold")
              .map((c) => (
                <li key={c.name}>
                  {c.name} — {t("creditBannerBody", { exposure: formatKwd(c.exposure, lk) })}
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secQuotes")}</h2>
        <DataTable
          columns={[
            { key: "id", label: t("colRef") },
            { key: "customer", label: t("colCustomer") },
            { key: "total", label: t("colTotal"), className: "text-right tabular-nums" },
            { key: "status", label: t("colStatus") },
            { key: "valid", label: t("colValidUntil") },
          ]}
          rows={d.quotations.map((q) => [
            q.id,
            q.customer,
            formatKwd(q.total, lk),
            t(`quoteStatus.${q.status}`),
            q.valid_until,
          ])}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secOrders")}</h2>
        <DataTable
          columns={[
            { key: "id", label: t("colRef") },
            { key: "customer", label: t("colCustomer") },
            { key: "total", label: t("colTotal"), className: "text-right tabular-nums" },
            { key: "state", label: t("colState") },
            { key: "eta", label: t("colDelivery") },
            { key: "exc", label: t("colExceptional") },
          ]}
          rows={d.orders.map((o) => [
            o.id,
            o.customer,
            formatKwd(o.total, lk),
            t(`orderState.${o.state}`),
            o.delivery_eta ?? "—",
            o.exceptional ? (
              <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
                {t("exceptionalYes")}
              </span>
            ) : (
              <span className="text-slate-500">—</span>
            ),
          ])}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secCustomers")}</h2>
        <DataTable
          columns={[
            { key: "name", label: t("colCustomer") },
            { key: "limit", label: t("colCreditLimit"), className: "text-right tabular-nums" },
            { key: "exp", label: t("colExposure"), className: "text-right tabular-nums" },
            { key: "score", label: t("colScore") },
            { key: "pay", label: t("colPayment") },
          ]}
          rows={d.customers.map((c) => [
            c.name,
            formatKwd(c.credit_limit, lk),
            formatKwd(c.exposure, lk),
            scoreBadge(c.score),
            payBadge(c.payment_status),
          ])}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secPipeline")}</h2>
        <DataTable
          columns={[
            { key: "deal", label: t("colDeal") },
            { key: "stage", label: t("colStage") },
            { key: "value", label: t("colValue"), className: "text-right tabular-nums" },
            { key: "prob", label: t("colProbability"), className: "text-right" },
            { key: "idle", label: t("colDaysIdle"), className: "text-right tabular-nums" },
            { key: "next", label: t("colNextAction") },
          ]}
          rows={d.pipeline.map((p) => [
            p.deal,
            p.stage,
            formatKwd(p.value, lk),
            `${Math.round(p.probability * 100)}%`,
            p.days_idle,
            p.next_action,
          ])}
        />
      </section>

      <SalesQuickQuoteDemo products={d.quick_quote_products} localeKey={lk} />
    </div>
  );
}
