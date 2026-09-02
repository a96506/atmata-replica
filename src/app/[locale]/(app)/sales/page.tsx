import { getLocale, getTranslations } from "next-intl/server";
import { AlertCircle } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listCustomers } from "@/lib/api/master";
import { getSalesOverview } from "@/lib/api/sales-overview";
import { listOpportunitiesPage } from "@/lib/api/q2c";
import { parseListPage } from "@/lib/db/read";
import { formatKwd } from "@/lib/utils";
import { pageMetadata } from "@/lib/metadata";
import { SalesQuickQuoteDemo } from "./sales-quick-quote-demo";
import { SalesPipelineTab } from "./sales-pipeline-tab";
import {
  parseSalesOverviewTab,
  SalesOverviewTabs,
} from "./sales-overview-tabs";
import { RoleHomeActions } from "@/components/app/RoleHomeActions";

export const generateMetadata = pageMetadata("nav", "sales");

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

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; tab?: string }>;
}) {
  const t = await getTranslations("sales");
  const th = await getTranslations("sales.homeActions");
  const locale = await getLocale();
  const lk = locale === "ar" ? "ar" : "en";
  const resolvedSearchParams = await searchParams;
  const { page, limit, offset } = parseListPage(resolvedSearchParams);
  const activeTab = parseSalesOverviewTab(resolvedSearchParams.tab);

  const [d, customerOptions, pipelinePage] = await Promise.all([
    getSalesOverview(),
    listCustomers().catch(() => []),
    listOpportunitiesPage({ limit, offset, activeOnly: true }).catch(() => ({
      items: [],
      total: 0,
      limit,
      offset,
    })),
  ]);

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

  const quoteStatusLabel = (status: string) =>
    status === "sent" || status === "draft"
      ? t(`quoteStatus.${status}`)
      : status;

  const orderStateLabel = (state: string) =>
    state === "confirmed" || state === "draft"
      ? t(`orderState.${state}`)
      : state;

  const holds = d.customers.filter((c) => c.payment_status === "on_hold");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <RoleHomeActions
            actions={[
              {
                label: th("newQuote"),
                href: `/${locale}/sales/quotes/new`,
                operation: "create_quote",
                primary: true,
              },
              {
                label: th("openQuotes"),
                href: `/${locale}/sales/quotes`,
              },
              {
                label: th("newSo"),
                href: `/${locale}/sales/orders/new`,
                operation: "create_sales_order",
              },
              {
                label: th("creditCheck"),
                href: `/${locale}/settings/customers`,
              },
            ]}
          />
        }
      />

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
      <SalesOverviewTabs activeTab={activeTab}>
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
              quoteStatusLabel(q.status),
              q.valid_until,
            ])}
            emptyMessage={t("empty.quotes")}
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
              orderStateLabel(o.state),
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
            emptyMessage={t("empty.orders")}
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
            emptyMessage={t("empty.customers")}
          />
        </TabsContent>

        <TabsContent value="pipeline">
          <SalesPipelineTab
            locale={locale}
            items={pipelinePage.items}
            emptyMessage={t("pipeline.emptyMessage")}
            serverPagination={{
              page,
              pageSize: pipelinePage.limit,
              total: pipelinePage.total,
            }}
            createRationale={t("pipeline.createRationale")}
            customers={customerOptions.map((c) => ({ id: c.id, name: c.name }))}
            columnLabels={{
              deal: t("colDeal"),
              stage: t("colStage"),
              value: t("colValue"),
              probability: t("colProbability"),
              daysIdle: t("colDaysIdle"),
              nextAction: t("colNextAction"),
              actions: t("pipeline.actions"),
            }}
            labels={{
              formTitle: t("pipeline.formTitle"),
              formHint: t("pipeline.formHint"),
              name: t("pipeline.name"),
              customer: t("colCustomer"),
              stage: t("colStage"),
              amount: t("pipeline.amount"),
              submit: t("pipeline.submit"),
              success: t("pipeline.success"),
              updateSuccess: t("pipeline.updateSuccess"),
              deleteSuccess: t("pipeline.deleteSuccess"),
              deleteConfirmTitle: t("pipeline.deleteConfirmTitle"),
              deleteConfirmDescription: t("pipeline.deleteConfirmDescription"),
              deleteConfirmLabel: t("pipeline.deleteConfirmLabel"),
              selectCustomer: t("pipeline.selectCustomer"),
              stages: {
                qualified: t("pipeline.stages.qualified"),
                proposal: t("pipeline.stages.proposal"),
                negotiation: t("pipeline.stages.negotiation"),
                won: t("pipeline.stages.won"),
                lost: t("pipeline.stages.lost"),
              },
            }}
          />
        </TabsContent>
      </SalesOverviewTabs>

      <SalesQuickQuoteDemo products={d.quick_quote_products} localeKey={lk} />
    </div>
  );
}
