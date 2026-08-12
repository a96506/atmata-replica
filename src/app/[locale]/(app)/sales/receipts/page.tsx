import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listCustomerReceipts } from "@/lib/api/q2c";
import { listCustomers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [rcps, customers] = await Promise.all([
    listCustomerReceipts(),
    listCustomers(),
  ]);

  return (
    <DocumentList
      title="Customer receipts"
      subtitle="Bank-ins settling customer invoices."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/receipts/new`} label="New Receipt" />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Date" },
          { key: "amount", label: "Amount", className: "text-right" },
          { key: "method", label: "Method" },
          { key: "state", label: "Status" },
        ]}
        rows={rcps.map((r) => {
          const cust = customers.find((c) => c.id === r.customerId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/receipts/${r.id}`}
              className="font-medium text-primary hover:underline"
            >
              {r.number}
            </Link>,
            cust?.name ?? "—",
            r.date,
            <span key="t" className="tabular-nums">
              {formatMoney(r.amount, r.currency)}
            </span>,
            r.method,
            <StateBadge key="s" state={r.state} />,
          ];
        })}
        emptyMessage="No customer receipts yet."
      />
    </DocumentList>
  );
}
