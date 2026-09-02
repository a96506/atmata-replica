import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import {
  listGoodsReceiptsPage,
  mapPurchaseOrderNumbersByIds,
} from "@/lib/api/p2p";
import { mapSupplierNamesByIds } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("purchasing");
  const { page, limit, offset } = parseListPage(await searchParams);

  const paged = await listGoodsReceiptsPage({ limit, offset });
  const [supplierNames, poNumbers] = await Promise.all([
    mapSupplierNamesByIds([...new Set(paged.items.map((g) => g.supplierId))]),
    mapPurchaseOrderNumbersByIds([...new Set(paged.items.map((g) => g.poId))]),
  ]);

  return (
    <DocumentList
      title="Goods receipts"
      subtitle="Each receipt posts a stock move and feeds 3-way match against the bill."
      primaryAction={
        <NewDocButton
          href={`/${locale}/purchasing/goods-receipts/new`}
          label="New GRN"
        
          operation="create_goods_receipt"/>
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
        rows={paged.items.map((g) => {
          const poNumber = poNumbers.get(g.poId);
          return [
            <Link
              key="n"
              href={`/purchasing/goods-receipts/${g.id}`}
              className="font-medium text-primary hover:underline"
            >
              {g.number}
            </Link>,
            poNumber ? (
              <Link
                key="p"
                href={`/purchasing/purchase-orders/${g.poId}`}
                className="text-primary hover:underline"
              >
                {poNumber}
              </Link>
            ) : (
              "—"
            ),
            supplierNames.get(g.supplierId) ?? "—",
            g.date,
            <StateBadge key="s" state={g.state} />,
          ];
        })}
        emptyMessage={t("empty.goodsReceipts")}
        serverPagination={{
          page,
          pageSize: paged.limit,
          total: paged.total,
        }}
      />
    </DocumentList>
  );
}
