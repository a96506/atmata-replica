import { getLocale, getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { DEMO_PURCHASING } from "@/lib/demo-data";
import { formatKwd } from "@/lib/utils";
import { BillMatchActions, PoSuggestionActions, ReceivingDemoActions } from "./purchasing-demo-actions";
import { PurchaseHistoryWithNewPo } from "./purchase-history-with-new-po";

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs tracking-wide text-slate-600 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function severityClass(s: string) {
  if (s === "high") return "bg-red-100 text-red-900";
  if (s === "medium") return "bg-amber-100 text-amber-950";
  return "bg-slate-100 text-slate-800";
}

export default async function PurchasingPage() {
  const t = await getTranslations("purchasing");
  const locale = await getLocale();
  const lk = locale === "ar" ? "ar" : "en";
  const d = DEMO_PURCHASING;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-700">{t("subtitle")}</p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label={t("kpiPoSuggestions")} value={d.po_suggestions.length} />
        <Kpi label={t("kpiBillQueue")} value={d.bill_matches.length} />
        <Kpi label={t("kpiPriceAlerts")} value={d.price_alerts.length} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secPoSuggestions")}</h2>
        <DataTable
          columns={[
            { key: "id", label: t("colId") },
            { key: "product", label: t("colProduct") },
            { key: "vendor", label: t("colVendor") },
            { key: "qty", label: t("colQty"), className: "text-right tabular-nums" },
            { key: "unit", label: t("colEstUnit"), className: "text-right tabular-nums" },
            { key: "sev", label: t("colPriority") },
            { key: "act", label: t("colActions"), className: "text-right" },
          ]}
          rows={d.po_suggestions.map((r) => [
            r.id,
            r.product,
            r.vendor,
            r.qty,
            formatKwd(r.est_unit, lk),
            <span key={`s-${r.id}`} className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityClass(r.severity)}`}>
              {t(`severity.${r.severity}`)}
            </span>,
            <PoSuggestionActions key={`a-${r.id}`} id={r.id} />,
          ])}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secBillMatch")}</h2>
        <DataTable
          columns={[
            { key: "id", label: t("colBill") },
            { key: "vendor", label: t("colVendor") },
            { key: "po", label: t("colPo") },
            { key: "st", label: t("colMatchStatus") },
            { key: "disc", label: t("colDiscrepancy") },
            { key: "act", label: t("colActions"), className: "text-right" },
          ]}
          rows={d.bill_matches.map((b) => [
            b.bill_ref,
            b.vendor,
            b.po_ref,
            t(`matchStatus.${b.status}`),
            b.discrepancy ?? "—",
            <BillMatchActions key={b.id} id={b.id} status={b.status} />,
          ])}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t("secPriceAlerts")}</h2>
        <ul className="mt-3 space-y-2">
          {d.price_alerts.map((a, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="font-medium">{a.vendor}</span> · {a.product}
              </span>
              <span className="tabular-nums font-medium">
                +{a.change_pct}% — {a.note}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secVendorScores")}</h2>
        <DataTable
          columns={[
            { key: "v", label: t("colVendor") },
            { key: "s", label: t("colScore"), className: "text-right tabular-nums" },
            { key: "l", label: t("colLeadDays"), className: "text-right tabular-nums" },
            { key: "q", label: t("colQuality") },
            { key: "p", label: t("colPriceRank"), className: "text-right tabular-nums" },
          ]}
          rows={d.vendor_scores.map((v) => [
            v.vendor,
            v.score,
            v.lead_days,
            t(`quality.${v.quality}`),
            v.price_rank,
          ])}
        />
      </section>

      <PurchaseHistoryWithNewPo initialRows={d.purchase_history} locale={lk} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t("secReceiving")}</h2>
        <DataTable
          columns={[
            { key: "ref", label: t("colTransfer") },
            { key: "po", label: t("colPo") },
            { key: "st", label: t("colRecvStatus") },
            { key: "exp", label: t("colExpected"), className: "text-right tabular-nums" },
            { key: "got", label: t("colReceived"), className: "text-right tabular-nums" },
            { key: "flg", label: t("colFlag") },
            { key: "act", label: t("colActions"), className: "text-right" },
          ]}
          rows={d.receiving.map((r) => [
            r.ref,
            r.po,
            t(`recvState.${r.status}`),
            r.expected,
            r.received,
            r.flag ? t(`recvFlag.${r.flag}`) : "—",
            <ReceivingDemoActions key={r.ref} refCode={r.ref} />,
          ])}
        />
      </section>
    </div>
  );
}
