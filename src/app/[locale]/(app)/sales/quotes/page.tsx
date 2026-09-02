import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listQuotesPage } from "@/lib/api/q2c";
import { mapCustomerNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "quotes");

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

  const paged = await listQuotesPage({ limit, offset });
  const customerNames = await mapCustomerNamesByIds([
    ...new Set(paged.items.map((q) => q.customerId)),
  ]);

  return (
    <DocumentList
      title="Quotes"
      subtitle="Quote-to-cash · proposals to customers."
      primaryAction={
        <NewDocButton
          href={`/${locale}/sales/quotes/new`}
          label="New Quote"
          operation="create_quote"
        />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Date" },
          { key: "valid", label: "Valid until" },
          { key: "total", label: "Total", className: "text-right" },
          { key: "state", label: "Status" },
        ]}
        rows={paged.items.map((q) => [
          <Link
            key="n"
            href={`/sales/quotes/${q.id}`}
            className="font-medium text-primary hover:underline"
          >
            {q.number}
          </Link>,
          customerNames.get(q.customerId) ?? "—",
          q.date,
          q.validUntil,
          <span key="t" className="tabular-nums">
            {formatMoney(q.total, q.currency)}
          </span>,
          <StateBadge key="s" state={q.state} />,
        ])}
        emptyMessage={t("empty.quotes")}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
