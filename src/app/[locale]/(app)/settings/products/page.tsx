import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import { listProducts, listTaxCodes } from "@/lib/api/master";
import { pageMetadata } from "@/lib/metadata";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/lib/actions/master";

export const generateMetadata = pageMetadata("nav", "products");

const COLUMNS: Column[] = [
  { key: "sku", label: "SKU" },
  { key: "name", label: "Name" },
  { key: "uom", label: "UoM" },
  { key: "tax", label: "Tax code" },
  { key: "cost", label: "Costing" },
  { key: "lot", label: "Lot-tracked" },
  { key: "p", label: "Purchasable" },
  { key: "s", label: "Sellable" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [rows, taxCodes] = await Promise.all([listProducts(), listTaxCodes()]);

  const fields: MasterField[] = [
    { name: "sku", label: "SKU", type: "text", required: true, placeholder: "e.g. WIDGET-001" },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "uom", label: "UoM", type: "text", required: true, placeholder: "ea / kg / box" },
    {
      name: "taxCodeId",
      label: "Tax code",
      type: "searchSelect",
      required: true,
      options: taxCodes.map((t) => ({
        value: t.id,
        label: `${t.code} · ${t.nameEn} (${(t.rate * 100).toFixed(0)}%)`,
        hint: t.jurisdiction,
      })),
    },
    {
      name: "costingMethod",
      label: "Costing method",
      type: "select",
      required: true,
      options: [
        { value: "FIFO", label: "FIFO" },
        { value: "AVG", label: "Average (AVG)" },
        { value: "STD", label: "Standard (STD)" },
      ],
    },
    { name: "lotTracked", label: "Lot-tracked", type: "boolean" },
    { name: "purchasable", label: "Purchasable", type: "boolean" },
    { name: "sellable", label: "Sellable", type: "boolean" },
    { name: "defaultPurchasePrice", label: "Default purchase price", type: "money", currency: "KWD" },
    { name: "defaultSalePrice", label: "Default sale price", type: "money", currency: "KWD" },
    { name: "reorderPoint", label: "Reorder point", type: "number", min: 0 },
  ];

  const entities = rows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    uom: p.uom,
    taxCodeId: p.taxCodeId,
    costingMethod: p.costingMethod,
    lotTracked: p.lotTracked,
    purchasable: p.purchasable,
    sellable: p.sellable,
    defaultPurchasePrice: p.defaultPurchasePrice,
    defaultSalePrice: p.defaultSalePrice,
    reorderPoint: p.reorderPoint ?? 0,
  }));

  const tableRows = rows.map((p) => [
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
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Product"
      title="Products"
      subtitle="UoM · tax class · costing · lot/serial. Click an SKU for Product 360."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createProductAction}
      onUpdate={updateProductAction}
      onDelete={deleteProductAction}
      extraActions={
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
      }
    />
  );
}
