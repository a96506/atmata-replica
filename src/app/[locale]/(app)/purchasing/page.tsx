import { getLocale, getTranslations } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_PURCHASING } from "@/lib/demo-data";
import { formatKwd } from "@/lib/utils";
import {
  BillMatchActions,
  PoSuggestionActions,
  ReceivingDemoActions,
} from "./purchasing-demo-actions";
import { PurchaseHistoryWithNewPo } from "./purchase-history-with-new-po";

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function PurchasingPage() {
  const t = await getTranslations("purchasing");
  const locale = await getLocale();
  const lk = locale === "ar" ? "ar" : "en";
  const d = DEMO_PURCHASING;

  const severityBadge = (s: string) => {
    const tone =
      s === "high"
        ? "bg-status-danger-muted text-status-danger-foreground border-status-danger-border"
        : s === "medium"
          ? "bg-status-pending-muted text-status-pending-foreground border-status-pending-border"
          : "bg-muted text-muted-foreground border-border";
    return (
      <Badge variant="outline" className={tone}>
        {t(`severity.${s}`)}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label={t("kpiPoSuggestions")} value={d.po_suggestions.length} />
        <Kpi label={t("kpiBillQueue")} value={d.bill_matches.length} />
        <Kpi label={t("kpiPriceAlerts")} value={d.price_alerts.length} />
      </section>

      {d.price_alerts.length > 0 ? (
        <Alert>
          <TrendingUp />
          <AlertTitle>{t("secPriceAlerts")}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {d.price_alerts.map((a, i) => (
                <li key={i}>
                  <span className="font-medium">{a.vendor}</span> · {a.product}{" "}
                  <span className="tabular-nums">{`+${a.change_pct}%`}</span> —{" "}
                  {a.note}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Four queues share one surface via tabs so the overview stays a single
          screen instead of four stacked tables. */}
      <Tabs defaultValue="suggestions">
        <TabsList>
          <TabsTrigger value="suggestions">{t("secPoSuggestions")}</TabsTrigger>
          <TabsTrigger value="bills">{t("secBillMatch")}</TabsTrigger>
          <TabsTrigger value="vendors">{t("secVendorScores")}</TabsTrigger>
          <TabsTrigger value="receiving">{t("secReceiving")}</TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions">
          <DataTable
            columns={[
              { key: "id", label: t("colId") },
              { key: "product", label: t("colProduct") },
              { key: "vendor", label: t("colVendor") },
              {
                key: "qty",
                label: t("colQty"),
                className: "text-right tabular-nums",
              },
              {
                key: "unit",
                label: t("colEstUnit"),
                className: "text-right tabular-nums",
              },
              { key: "sev", label: t("colPriority") },
              { key: "act", label: t("colActions"), className: "text-right" },
            ]}
            rows={d.po_suggestions.map((r) => [
              r.id,
              r.product,
              r.vendor,
              r.qty,
              formatKwd(r.est_unit, lk),
              severityBadge(r.severity),
              <PoSuggestionActions key={`a-${r.id}`} id={r.id} />,
            ])}
          />
        </TabsContent>

        <TabsContent value="bills">
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
        </TabsContent>

        <TabsContent value="vendors">
          <DataTable
            columns={[
              { key: "v", label: t("colVendor") },
              {
                key: "s",
                label: t("colScore"),
                className: "text-right tabular-nums",
              },
              {
                key: "l",
                label: t("colLeadDays"),
                className: "text-right tabular-nums",
              },
              { key: "q", label: t("colQuality") },
              {
                key: "p",
                label: t("colPriceRank"),
                className: "text-right tabular-nums",
              },
            ]}
            rows={d.vendor_scores.map((v) => [
              v.vendor,
              v.score,
              v.lead_days,
              t(`quality.${v.quality}`),
              v.price_rank,
            ])}
          />
        </TabsContent>

        <TabsContent value="receiving">
          <DataTable
            columns={[
              { key: "ref", label: t("colTransfer") },
              { key: "po", label: t("colPo") },
              { key: "st", label: t("colRecvStatus") },
              {
                key: "exp",
                label: t("colExpected"),
                className: "text-right tabular-nums",
              },
              {
                key: "got",
                label: t("colReceived"),
                className: "text-right tabular-nums",
              },
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
        </TabsContent>
      </Tabs>

      <PurchaseHistoryWithNewPo initialRows={d.purchase_history} locale={lk} />
    </div>
  );
}
