import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listCustomerInvoices } from "@/lib/api/q2c";
import { listCustomers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [invs, customers] = await Promise.all([
    listCustomerInvoices(),
    listCustomers(),
  ]);

  return (
    <DocumentList
      title="Customer invoices"
      subtitle="AR invoices. Saudi-jurisdiction invoices render FATOORA QR."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/invoices/new`} label="New Invoice" />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Date" },
          { key: "due", label: "Due" },
          { key: "total", label: "Total", className: "text-right" },
          { key: "balance", label: "Balance", className: "text-right" },
          { key: "state", label: "Status" },
        ]}
        rows={invs.map((i) => {
          const cust = customers.find((c) => c.id === i.customerId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/invoices/${i.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {i.number}
            </Link>,
            cust?.name ?? "—",
            i.date,
            i.dueDate,
            <span key="t" className="tabular-nums">
              {formatMoney(i.total, i.currency)}
            </span>,
            <span key="b" className="tabular-nums">
              {formatMoney(i.total - i.paid, i.currency)}
            </span>,
            <StateBadge key="s" state={i.state} />,
          ];
        })}
        emptyMessage="No invoices yet."
      />
    </DocumentList>
  );
}
