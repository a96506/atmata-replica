import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import {
  listDeliveryNotesPage,
  mapSalesOrderNumbersByIds,
} from "@/lib/api/q2c";
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
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listDeliveryNotesPage({ limit, offset });
  const [customerNames, soNumbers] = await Promise.all([
    mapCustomerNamesByIds([...new Set(paged.items.map((d) => d.customerId))]),
    mapSalesOrderNumbersByIds([...new Set(paged.items.map((d) => d.soId))]),
  ]);

  return (
    <DocumentList
      title="Delivery notes"
      subtitle="Outbound shipments. Each posts a stock-out move."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/deliveries/new`} label="New Delivery" 
          operation="create_delivery_note"/>
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "so", label: "SO" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Date" },
          { key: "state", label: "Status" },
        ]}
        rows={paged.items.map((d) => {
          const soNumber = soNumbers.get(d.soId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/deliveries/${d.id}`}
              className="font-medium text-primary hover:underline"
            >
              {d.number}
            </Link>,
            soNumber ? (
              <Link
                key="s"
                href={`/${locale}/sales/orders/${d.soId}`}
                className="text-primary hover:underline"
              >
                {soNumber}
              </Link>
            ) : (
              "—"
            ),
            customerNames.get(d.customerId) ?? "—",
            d.date,
            <StateBadge key="st" state={d.state} />,
          ];
        })}
        emptyMessage="No delivery notes yet."
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
