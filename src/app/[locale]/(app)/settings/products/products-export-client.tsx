"use client";

import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import type { Product } from "@/types";

/** Client island: CSV column accessors stay off the RSC boundary. */
export function ProductsExportClient({ rows }: { rows: Product[] }) {
  return (
    <ExportCsvButton
      rows={rows}
      filename="products"
      columns={[
        { label: "SKU", value: (p) => p.sku },
        { label: "Name", value: (p) => p.name },
        { label: "UoM", value: (p) => p.uom },
        { label: "Tax code id", value: (p) => p.taxCodeId },
        { label: "Costing method", value: (p) => p.costingMethod },
        { label: "Lot tracked", value: (p) => p.lotTracked },
        { label: "Purchasable", value: (p) => p.purchasable },
        { label: "Sellable", value: (p) => p.sellable },
        { label: "Default purchase price", value: (p) => p.defaultPurchasePrice },
        { label: "Default sale price", value: (p) => p.defaultSalePrice },
        { label: "Reorder point", value: (p) => p.reorderPoint ?? 0 },
      ]}
    />
  );
}
