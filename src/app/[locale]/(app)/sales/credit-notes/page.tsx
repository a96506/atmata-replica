import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { listCreditNotes } from "@/lib/api/returns";
import { listCustomers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [notes, customers] = await Promise.all([listCreditNotes(), listCustomers()]);

  return (
    <DocumentList
      title="Credit notes"
      subtitle="Auto-generated from Customer Returns. Applied against the source invoice or refunded."
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "cr", label: "From return" },
          { key: "customer", label: "Customer" },
          { key: "inv", label: "Applied to" },
          { key: "date", label: "Date" },
          { key: "total", label: "Total" },
          { key: "applied", label: "Applied" },
          { key: "state", label: "Status" },
        ]}
        rows={notes.map((c) => {
          const cust = customers.find((x) => x.id === c.customerId);
          return [
            <Link
              key="n"
              href={`/${locale}/sales/credit-notes/${c.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {c.number}
            </Link>,
            <Link
              key="cr"
              href={`/${locale}/sales/returns/${c.customerReturnId}`}
              className="text-orange-600 hover:underline"
            >
              {c.customerReturnId}
            </Link>,
            cust?.name ?? "—",
            c.invoiceId ? (
              <Link
                key="i"
                href={`/${locale}/sales/invoices/${c.invoiceId}`}
                className="text-orange-600 hover:underline"
              >
                {c.invoiceId}
              </Link>
            ) : (
              "—"
            ),
            c.date,
            <span key="t" className="tabular-nums">{formatMoney(c.total, c.currency)}</span>,
            <span key="a" className="tabular-nums">{formatMoney(c.applied, c.currency)}</span>,
            <StateBadge key="s" state={c.state} />,
          ];
        })}
        emptyMessage="No credit notes yet."
      />
    </DocumentList>
  );
}
