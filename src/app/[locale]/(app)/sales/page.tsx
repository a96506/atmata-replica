import { getLocale, getTranslations } from "next-intl/server";
import { AlertCircle } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_SALES } from "@/lib/demo-data";
import { formatKwd } from "@/lib/utils";
import { SalesQuickQuoteDemo } from "./sales-quick-quote-demo";

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

export default async function SalesPage() {
  const t = await getTranslations("sales");
  const locale = await getLocale();
  const lk = locale === "ar" ? "ar" : "en";
  const d = DEMO_SALES;

  const payBadge = (status: string) => {
    const tone =
      status === "current"
        ? "bg-status-success-muted text-status-success-foreground border-status-success-border"
        : status === "overdue_14"
          ? "bg-status-pending-muted text-status-pending-foreground border-status-pending-border"
          : "bg-status-danger-muted text-status-danger-foreground border-status-danger-border";
    return (
      <Badge variant="outline" className={tone}>
        {t(`pay.${status}`)}
      </Badge>
    );
  };

  const scoreBadge = (score: string) => (
    <Badge variant="secondary">{score}</Badge>
  );

  const holds = d.customers.filter((c) => c.payment_status === "on_hold");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label={t("kpiQuotes")} value={d.summary.pending_quotes} />
        <Kpi label={t("kpiOverdue")} value={d.summary.overdue_customers} />
        <Kpi label={t("kpiCreditHolds")} value={d.summary.credit_holds} />
      </section>

      {holds.length > 0 ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{t("creditBannerTitle")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {holds.map((c) => (
                <li key={c.name}>
                  {c.name} —{" "}
                  {t("creditBannerBody", {
                    exposure: formatKwd(c.exposure, lk),
                  })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Four datasets share one surface via tabs so the overview stays a
          single screen instead of four stacked tables. */}
      <Tabs defaultValue="quotes">
        <TabsList>
          <TabsTrigger value="quotes">{t("secQuotes")}</TabsTrigger>
          <TabsTrigger value="orders">{t("secOrders")}</TabsTrigger>
          <TabsTrigger value="customers">{t("secCustomers")}</TabsTrigger>
          <TabsTrigger value="pipeline">{t("secPipeline")}</TabsTrigger>
        </TabsList>

        <TabsContent value="quotes">
          <DataTable
            columns={[
              { key: "id", label: t("colRef") },
              { key: "customer", label: t("colCustomer") },
              {
                key: "total",
                label: t("colTotal"),
                className: "text-right tabular-nums",
              },
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
        </TabsContent>

        <TabsContent value="orders">
          <DataTable
            columns={[
              { key: "id", label: t("colRef") },
              { key: "customer", label: t("colCustomer") },
              {
                key: "total",
                label: t("colTotal"),
                className: "text-right tabular-nums",
              },
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
                <Badge
                  variant="outline"
                  className="bg-status-info-muted text-status-info-foreground border-status-info-border"
                >
                  {t("exceptionalYes")}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
            ])}
          />
        </TabsContent>

        <TabsContent value="customers">
          <DataTable
            columns={[
              { key: "name", label: t("colCustomer") },
              {
                key: "limit",
                label: t("colCreditLimit"),
                className: "text-right tabular-nums",
              },
              {
                key: "exp",
                label: t("colExposure"),
                className: "text-right tabular-nums",
              },
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
        </TabsContent>

        <TabsContent value="pipeline">
          <DataTable
            columns={[
              { key: "deal", label: t("colDeal") },
              { key: "stage", label: t("colStage") },
              {
                key: "value",
                label: t("colValue"),
                className: "text-right tabular-nums",
              },
              {
                key: "prob",
                label: t("colProbability"),
                className: "text-right",
              },
              {
                key: "idle",
                label: t("colDaysIdle"),
                className: "text-right tabular-nums",
              },
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
        </TabsContent>
      </Tabs>

      <SalesQuickQuoteDemo products={d.quick_quote_products} localeKey={lk} />
    </div>
  );
}
