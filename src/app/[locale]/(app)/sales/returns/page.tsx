import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listCustomerReturns } from "@/lib/api/returns";
import { listCustomers } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [returns, customers] = await Promise.all([listCustomerReturns(), listCustomers()]);

  return (
    <DocumentList
      title="Customer returns"
      subtitle="Reverse a delivery. A Credit Note is generated on post and applied against the source invoice."
      primaryAction={
        <NewDocButton href={`/${locale}/sales/returns/new`} label="New return" />
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
        rows={returns.map((c) => {
          const cust = customers.find((x) => x.id === c.customerId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/returns/${c.id}`}
              className="font-medium text-primary hover:underline"
            >
              {c.number}
            </Link>,
            <Link
              key="d"
              href={`/${locale}/sales/deliveries/${c.dnId}`}
              className="text-primary hover:underline"
            >
              {c.dnId}
            </Link>,
            cust?.name ?? "—",
            c.date,
            c.lines.length,
            <StateBadge key="s" state={c.state} />,
          ];
        })}
        emptyMessage="No customer returns yet."
      />
    </DocumentList>
  );
}
