import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { listCreditNotesPage } from "@/lib/api/returns";
import { mapCustomerNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listCreditNotesPage({ limit, offset });
  const customerNames = await mapCustomerNamesByIds([
    ...new Set(paged.items.map((c) => c.customerId)),
  ]);

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
        rows={paged.items.map((c) => [
          <Link
            key="n"
            href={`/${locale}/sales/credit-notes/${c.id}`}
            className="font-medium text-primary hover:underline"
          >
            {c.number}
          </Link>,
          <Link
            key="cr"
            href={`/${locale}/sales/returns/${c.customerReturnId}`}
            className="text-primary hover:underline"
          >
            {c.customerReturnId}
          </Link>,
          customerNames.get(c.customerId) ?? "—",
          c.invoiceId ? (
            <Link
              key="i"
              href={`/${locale}/sales/invoices/${c.invoiceId}`}
              className="text-primary hover:underline"
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
        ])}
        emptyMessage="No credit notes yet."
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
