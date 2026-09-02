import { notFound } from "next/navigation";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import type { Column } from "@/components/data-table";
import {
  getPriceList,
  listPriceListItems,
  listProducts,
} from "@/lib/api/master";
import {
  createPriceListItemAction,
  deletePriceListItemAction,
  updatePriceListItemAction,
} from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "product", label: "Product" },
  { key: "minQty", label: "Min qty" },
  { key: "unitPrice", label: "Unit price" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const [list, items, products] = await Promise.all([
    getPriceList(id),
    listPriceListItems(id),
    listProducts(),
  ]);
  if (!list) notFound();

  const productLabel = new Map(
    products.map((p) => [p.id, `${p.sku} · ${p.name}`]),
  );

  const fields: MasterField[] = [
    {
      name: "productId",
      label: "Product",
      type: "searchSelect",
      required: true,
      options: products
        .filter((p) => p.sellable)
        .map((p) => ({
          value: p.id,
          label: `${p.sku} · ${p.name}`,
          hint: p.uom,
        })),
    },
    {
      name: "minQty",
      label: "Min qty",
      type: "number",
      required: true,
      min: 0.000001,
    },
    {
      name: "unitPrice",
      label: "Unit price",
      type: "money",
      currency: (list.currency as "KWD" | "SAR" | "AED" | "USD") || "KWD",
    },
  ];

  const entities = items.map((row) => ({
    id: row.id,
    productId: row.productId,
    minQty: row.minQty,
    unitPrice: row.unitPrice,
    priceListId: id,
  }));

  const tableRows = items.map((row) => [
    productLabel.get(row.productId) ?? row.productId,
    row.minQty,
    row.unitPrice.toLocaleString(undefined, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Price list
        </div>
        <h1 className="text-xl font-semibold text-foreground">{list.name}</h1>
        <p className="text-sm text-muted-foreground">
          {list.currency}
          {list.active ? " · active" : " · inactive"}
          {list.startsOn ? ` · from ${list.startsOn}` : ""}
          {list.endsOn ? ` · until ${list.endsOn}` : ""}
        </p>
      </div>

      <MasterCrud
        locale={locale}
        entityLabel="Price line"
        title="Price lines"
        subtitle="Quantity breaks resolve via resolve_price_list_item when a quote/SO line picks the product."
        columns={COLUMNS}
        tableRows={tableRows}
        entities={entities}
        fields={fields}
        onCreate={async (input) =>
          createPriceListItemAction({
            ...(input as Record<string, unknown>),
            priceListId: id,
          })
        }
        onUpdate={async (input) =>
          updatePriceListItemAction({
            ...(input as Record<string, unknown>),
            priceListId: id,
          })
        }
        onDelete={deletePriceListItemAction}
        writeOperation="create_price_list"
      />
    </div>
  );
}
