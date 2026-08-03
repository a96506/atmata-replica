import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listQuotes } from "@/lib/api/q2c";
import { listCustomers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [quotes, customers] = await Promise.all([listQuotes(), listCustomers()]);

  return (
    <DocumentList
      title="Quotes"
      subtitle="Quote-to-cash · proposals to customers."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/quotes/new`} label="New Quote" />
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
        rows={quotes.map((q) => {
          const cust = customers.find((c) => c.id === q.customerId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/quotes/${q.id}`}
              className="font-medium text-primary hover:underline"
            >
              {q.number}
            </Link>,
            cust?.name ?? "—",
            q.date,
            q.validUntil,
            <span key="t" className="tabular-nums">
              {formatMoney(q.total, q.currency)}
            </span>,
            <StateBadge key="s" state={q.state} />,
          ];
        })}
        emptyMessage="No quotes yet."
      />
    </DocumentList>
  );
}
