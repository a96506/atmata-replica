import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listVendorPayments } from "@/lib/api/p2p";
import { listSuppliers } from "@/lib/api/master";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [pays, suppliers] = await Promise.all([
    listVendorPayments(),
    listSuppliers(),
  ]);

  return (
    <DocumentList
      title="Vendor payments"
      subtitle="Bank-outs settling vendor bills."
      primaryAction={
        <NewDocButton
          href={`/${locale}/purchasing/payments/new`}
          label="New Payment"
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
        rows={pays.map((p) => {
          const sup = suppliers.find((s) => s.id === p.supplierId);
          return [
            <Link
              key="n"
              href={`/${locale}/purchasing/payments/${p.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {p.number}
            </Link>,
            sup?.name ?? "—",
            p.date,
            <span key="t" className="tabular-nums">
              {formatMoney(p.amount, p.currency)}
            </span>,
            p.method,
            <StateBadge key="s" state={p.state} />,
          ];
        })}
        emptyMessage="No vendor payments yet."
      />
    </DocumentList>
  );
}
