import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listCustomerReceiptsPage } from "@/lib/api/q2c";
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

  const paged = await listCustomerReceiptsPage({ limit, offset });
  const customerNames = await mapCustomerNamesByIds([
    ...new Set(paged.items.map((r) => r.customerId)),
  ]);

  return (
    <DocumentList
      title="Customer receipts"
      subtitle="Bank-ins settling customer invoices."
      primaryAction={
        <NewDocButton
          href={`/${locale}/sales/receipts/new`}
          label="New Receipt"
          operation="create_customer_receipt"
        />
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
        rows={paged.items.map((r) => [
          <Link
            key="n"
            href={`/${locale}/sales/receipts/${r.id}`}
            className="font-medium text-primary hover:underline"
          >
            {r.number}
          </Link>,
          customerNames.get(r.customerId) ?? "—",
          r.date,
          <span key="t" className="tabular-nums">
            {formatMoney(r.amount, r.currency)}
          </span>,
          r.method,
          <StateBadge key="s" state={r.state} />,
        ])}
        emptyMessage="No customer receipts yet."
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
