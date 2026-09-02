import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listSalesOrdersPage } from "@/lib/api/q2c";
import { mapCustomerNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "sales_orders");

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("sales");
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listSalesOrdersPage({ limit, offset });
  const customerNames = await mapCustomerNamesByIds([
    ...new Set(paged.items.map((s) => s.customerId)),
  ]);

  return (
    <DocumentList
      title="Sales orders"
      subtitle="Confirmed customer orders."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/orders/new`} label="New SO" 
          operation="create_sales_order"/>
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Date" },
          { key: "delivery", label: "Expected delivery" },
          { key: "total", label: "Total", className: "text-right" },
          { key: "state", label: "Status" },
        ]}
        rows={paged.items.map((s) => [
          <Link
            key="n"
            href={`/sales/orders/${s.id}`}
            className="font-medium text-primary hover:underline"
          >
            {s.number}
          </Link>,
          customerNames.get(s.customerId) ?? "—",
          s.date,
          s.expectedDeliveryDate,
          <span key="t" className="tabular-nums">
            {formatMoney(s.total, s.currency)}
          </span>,
          <span key="s" className="flex items-center gap-2">
            <StateBadge state={s.state} />
            {s.blockedReason ? (
              <span className="rounded-full bg-status-danger-muted px-2 py-0.5 text-xs font-medium text-destructive">
                blocked
              </span>
            ) : null}
          </span>,
        ])}
        emptyMessage={t("empty.orders")}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
