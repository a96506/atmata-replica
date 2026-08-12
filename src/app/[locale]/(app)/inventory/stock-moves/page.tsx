import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listStockMoves } from "@/lib/api/inventory-tx";
import { listProducts, listWarehouses } from "@/lib/api/master";

const SOURCE_HREF: Record<string, (locale: string, id: string) => string> = {
  grn: (l, id) => `/${l}/purchasing/goods-receipts/${id}`,
  delivery_note: (l, id) => `/${l}/sales/deliveries/${id}`,
  internal_transfer: (l, id) => `/${l}/inventory/transfers/${id}`,
  stock_adjustment: (l, id) => `/${l}/inventory/adjustments/${id}`,
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sku?: string }>;
}) {
  const { locale } = await params;
  const { sku } = await searchParams;
  const [allMoves, products, warehouses] = await Promise.all([
    listStockMoves(),
    listProducts(),
    listWarehouses(),
  ]);
  const filtered = sku
    ? allMoves.filter((m) => products.find((p) => p.id === m.productId)?.sku === sku)
    : allMoves;
  const moves = filtered;

  return (
    <DocumentList
      title="Stock moves"
      subtitle={
        sku
          ? `Filtered to SKU ${sku}. Atomic inventory ledger.`
          : "Atomic inventory ledger. Every GRN, delivery, transfer and adjustment posts one or more moves."
      }
    >
      <DataTable
        columns={[
          { key: "id", label: "Move" },
          { key: "date", label: "Date" },
          { key: "product", label: "Product" },
          { key: "wh", label: "Warehouse" },
          { key: "dir", label: "Dir" },
          { key: "qty", label: "Qty", className: "text-right" },
          { key: "cost", label: "Cost", className: "text-right" },
          { key: "source", label: "Source" },
        ]}
        rows={moves.map((m) => {
          const prod = products.find((p) => p.id === m.productId);
          const wh = warehouses.find((w) => w.id === m.warehouseId);
          const hrefFn = SOURCE_HREF[m.sourceType];
          return [
            <span id={m.id} key="id" className="font-mono text-xs text-foreground">
              {m.number}
            </span>,
            m.date,
            prod ? (
              <Link
                key="p"
                href={`/${locale}/inventory/products/${encodeURIComponent(prod.sku)}`}
                className="text-primary hover:underline"
              >
                {prod.sku} · {prod.name}
              </Link>
            ) : (
              "—"
            ),
            wh?.name ?? "—",
            <span
              key="d"
              className={
                "rounded-full px-2 py-0.5 text-xs font-medium " +
                (m.direction === "in"
                  ? "bg-status-success-muted text-status-success-foreground"
                  : "bg-status-danger-muted text-destructive")
              }
            >
              {m.direction === "in" ? "IN" : "OUT"}
            </span>,
            <span key="q" className="tabular-nums">
              {m.direction === "in" ? "+" : "-"}
              {m.qty}
              {prod ? ` ${prod.uom}` : ""}
            </span>,
            <span key="c" className="tabular-nums">
              {m.costPerUnit.toFixed(3)}
            </span>,
            hrefFn ? (
              <Link
                key="s"
                href={hrefFn(locale, m.sourceId)}
                className="text-xs text-primary hover:underline"
              >
                {m.sourceType} · {m.sourceId}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">
                {m.sourceType} · {m.sourceId}
              </span>
            ),
          ];
        })}
        emptyMessage="No stock moves yet."
      />
    </DocumentList>
  );
}
