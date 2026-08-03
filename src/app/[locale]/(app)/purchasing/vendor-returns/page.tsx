import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listVendorReturns } from "@/lib/api/returns";
import { listSuppliers } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [returns, suppliers] = await Promise.all([listVendorReturns(), listSuppliers()]);

  return (
    <DocumentList
      title="Vendor returns"
      subtitle="Reverse a received shipment. A Debit Note is generated on post and applied against the source bill."
      primaryAction={
        <NewDocButton href={`/${locale}/purchasing/vendor-returns/new`} label="New return" />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "from", label: "From GRN" },
          { key: "supplier", label: "Supplier" },
          { key: "date", label: "Date" },
          { key: "qty", label: "Lines" },
          { key: "state", label: "Status" },
        ]}
        rows={returns.map((v) => {
          const sup = suppliers.find((s) => s.id === v.supplierId);
          return [
            <Link
              key="n"
              href={`/${locale}/purchasing/vendor-returns/${v.id}`}
              className="font-medium text-primary hover:underline"
            >
              {v.number}
            </Link>,
            <Link
              key="g"
              href={`/${locale}/purchasing/goods-receipts/${v.grnId}`}
              className="text-primary hover:underline"
            >
              {v.grnId}
            </Link>,
            sup?.name ?? "—",
            v.date,
            v.lines.length,
            <StateBadge key="s" state={v.state} />,
          ];
        })}
        emptyMessage="No vendor returns yet."
      />
    </DocumentList>
  );
}
