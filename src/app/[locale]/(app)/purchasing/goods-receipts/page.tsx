import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listGoodsReceipts, listPurchaseOrders } from "@/lib/api/p2p";
import { listSuppliers } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [grns, suppliers, pos] = await Promise.all([
    listGoodsReceipts(),
    listSuppliers(),
    listPurchaseOrders(),
  ]);

  return (
    <DocumentList
      title="Goods receipts"
      subtitle="Each receipt posts a stock move and feeds 3-way match against the bill."
      primaryAction={
        <NewDocButton
          href={`/${locale}/purchasing/goods-receipts/new`}
          label="New GRN"
        />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "po", label: "PO" },
          { key: "supplier", label: "Supplier" },
          { key: "date", label: "Date" },
          { key: "state", label: "Status" },
        ]}
        rows={grns.map((g) => {
          const sup = suppliers.find((s) => s.id === g.supplierId);
          const po = pos.find((p) => p.id === g.poId);
          return [
            <Link
              key="n"
              href={`/${locale}/purchasing/goods-receipts/${g.id}`}
              className="font-medium text-orange-600 hover:underline"
            >
              {g.number}
            </Link>,
            po ? (
              <Link
                key="p"
                href={`/${locale}/purchasing/purchase-orders/${po.id}`}
                className="text-orange-600 hover:underline"
              >
                {po.number}
              </Link>
            ) : (
              "—"
            ),
            sup?.name ?? "—",
            g.date,
            <StateBadge key="s" state={g.state} />,
          ];
        })}
        emptyMessage="No goods receipts yet."
      />
    </DocumentList>
  );
}
