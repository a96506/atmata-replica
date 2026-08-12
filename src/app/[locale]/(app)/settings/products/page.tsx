import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listProducts } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listProducts();
  return (
    <DocumentList title="Products" subtitle="UoM · tax class · costing · lot/serial. Click an SKU for Product 360.">
      <DataTable
        columns={[
          { key: "sku", label: "SKU" },
          { key: "name", label: "Name" },
          { key: "uom", label: "UoM" },
          { key: "tax", label: "Tax code" },
          { key: "cost", label: "Costing" },
          { key: "lot", label: "Lot-tracked" },
          { key: "p", label: "Purchasable" },
          { key: "s", label: "Sellable" },
        ]}
        rows={rows.map((p) => [
          <Link
            key="sku"
            href={`/${locale}/inventory/products/${encodeURIComponent(p.sku)}`}
            className="font-mono text-xs font-medium text-primary hover:underline"
          >
            {p.sku}
          </Link>,
          p.name,
          p.uom,
          p.taxCodeId,
          p.costingMethod,
          p.lotTracked ? "yes" : "no",
          p.purchasable ? "yes" : "no",
          p.sellable ? "yes" : "no",
        ])}
      />
    </DocumentList>
  );
}
