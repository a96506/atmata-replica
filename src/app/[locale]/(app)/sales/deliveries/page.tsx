import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listDeliveryNotes, listSalesOrders } from "@/lib/api/q2c";
import { listCustomers } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [dns, customers, sos] = await Promise.all([
    listDeliveryNotes(),
    listCustomers(),
    listSalesOrders(),
  ]);

  return (
    <DocumentList
      title="Delivery notes"
      subtitle="Outbound shipments. Each posts a stock-out move."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/deliveries/new`} label="New Delivery" />
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
        rows={dns.map((d) => {
          const cust = customers.find((c) => c.id === d.customerId);
          const so = sos.find((s) => s.id === d.soId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/deliveries/${d.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {d.number}
            </Link>,
            so ? (
              <Link
                key="s"
                href={`/${locale}/sales/orders/${so.id}`}
                className="text-orange-600 hover:underline"
              >
                {so.number}
              </Link>
            ) : (
              "—"
            ),
            cust?.name ?? "—",
            d.date,
            <StateBadge key="st" state={d.state} />,
          ];
        })}
        emptyMessage="No delivery notes yet."
      />
    </DocumentList>
  );
}
