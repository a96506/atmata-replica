import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listCustomerReturnsPage } from "@/lib/api/returns";
import { mapCustomerNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";

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

  const paged = await listCustomerReturnsPage({ limit, offset });
  const customerNames = await mapCustomerNamesByIds([
    ...new Set(paged.items.map((c) => c.customerId)),
  ]);

  return (
    <DocumentList
      title="Customer returns"
      subtitle="Reverse a delivery. A Credit Note is generated on post and applied against the source invoice."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/returns/new`} label="New return" 
          operation="create_customer_return"/>
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "from", label: "From DN" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Date" },
          { key: "qty", label: "Lines" },
          { key: "state", label: "Status" },
        ]}
        rows={paged.items.map((c) => [
          <Link
            key="n"
            href={`/sales/returns/${c.id}`}
            className="font-medium text-primary hover:underline"
          >
            {c.number}
          </Link>,
          <Link
            key="d"
            href={`/sales/deliveries/${c.dnId}`}
            className="text-primary hover:underline"
          >
            {c.dnId}
          </Link>,
          customerNames.get(c.customerId) ?? "—",
          c.date,
          c.lines.length,
          <StateBadge key="s" state={c.state} />,
        ])}
        emptyMessage={t("empty.returns")}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
