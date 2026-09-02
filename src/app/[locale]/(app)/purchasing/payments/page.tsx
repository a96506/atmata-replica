import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listVendorPaymentsPage } from "@/lib/api/p2p";
import { mapSupplierNamesByIds } from "@/lib/api/master";
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

  const paged = await listVendorPaymentsPage({ limit, offset });
  const supplierNames = await mapSupplierNamesByIds([
    ...new Set(paged.items.map((p) => p.supplierId)),
  ]);

  return (
    <DocumentList
      title="Vendor payments"
      subtitle="Bank-outs settling vendor bills."
      primaryAction={
        <NewDocButton
          href={`/${locale}/purchasing/payments/new`}
          label="New Payment"
          operation="create_vendor_payment"
        />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "supplier", label: "Supplier" },
          { key: "date", label: "Date" },
          { key: "amount", label: "Amount", className: "text-right" },
          { key: "method", label: "Method" },
          { key: "state", label: "Status" },
        ]}
        rows={paged.items.map((p) => [
          <Link
            key="n"
            href={`/${locale}/purchasing/payments/${p.id}`}
            className="font-medium text-primary hover:underline"
          >
            {p.number}
          </Link>,
          supplierNames.get(p.supplierId) ?? "—",
          p.date,
          <span key="t" className="tabular-nums">
            {formatMoney(p.amount, p.currency)}
          </span>,
          p.method,
          <StateBadge key="s" state={p.state} />,
        ])}
        emptyMessage="No vendor payments yet."
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
