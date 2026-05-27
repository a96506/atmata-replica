import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listSalesOrders } from "@/lib/api/q2c";
import { listCustomers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [sos, customers] = await Promise.all([
    listSalesOrders(),
    listCustomers(),
  ]);

  return (
    <DocumentList
      title="Sales orders"
      subtitle="Confirmed customer orders."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/orders/new`} label="New SO" />
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
        rows={sos.map((s) => {
          const cust = customers.find((c) => c.id === s.customerId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/orders/${s.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {s.number}
            </Link>,
            cust?.name ?? "—",
            s.date,
            s.expectedDeliveryDate,
            <span key="t" className="tabular-nums">
              {formatMoney(s.total, s.currency)}
            </span>,
            <span key="s" className="flex items-center gap-2">
              <StateBadge state={s.state} />
              {s.blockedReason ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                  blocked
                </span>
              ) : null}
            </span>,
          ];
        })}
        emptyMessage="No sales orders yet."
      />
    </DocumentList>
  );
}
