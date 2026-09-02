import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { RoleHomeActions } from "@/components/app/RoleHomeActions";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { ListWarehouseFilter } from "@/components/list/ListStateFilter";
import { listStockMovesPage } from "@/lib/api/inventory-tx";
import { getProductBySku } from "@/lib/api/items";
import { listWarehouses } from "@/lib/api/master";
import {
  getReadClient,
  mapRows,
  parseListPage,
  requireData,
} from "@/lib/db/read";
import { MASTER_SELECTS } from "@/lib/db/selects";
import type { Product, Warehouse } from "@/types";

const SOURCE_HREF: Record<string, (locale: string, id: string) => string> = {
  grn: (l, id) => `/${l}/purchasing/goods-receipts/${id}`,
  delivery_note: (l, id) => `/${l}/sales/deliveries/${id}`,
  internal_transfer: (l, id) => `/${l}/inventory/transfers/${id}`,
  stock_adjustment: (l, id) => `/${l}/inventory/adjustments/${id}`,
};

async function productsByIds(ids: string[]): Promise<Map<string, Product>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const client = await getReadClient();
  const result = await client.database
    .from("products")
    .select(MASTER_SELECTS.products)
    .in("id", unique);
  const rows = mapRows<Product>(requireData(result, "products by id"));
  return new Map(rows.map((p) => [p.id, p]));
}

async function warehousesByIds(ids: string[]): Promise<Map<string, Warehouse>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const client = await getReadClient();
  const result = await client.database
    .from("warehouses")
    .select(MASTER_SELECTS.warehouses)
    .in("id", unique);
  const rows = mapRows<Warehouse>(requireData(result, "warehouses by id"));
  return new Map(rows.map((w) => [w.id, w]));
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    sku?: string;
    warehouse?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  const { locale } = await params;
  const th = await getTranslations("inventory.homeActions");
  const t = await getTranslations("inventory");
  const sp = await searchParams;
  const { page, limit, offset } = parseListPage(sp);
  const sku = typeof sp.sku === "string" ? sp.sku : undefined;
  const warehouseParam =
    typeof sp.warehouse === "string" && sp.warehouse.trim()
      ? sp.warehouse.trim()
      : undefined;

  const allWarehouses = await listWarehouses().catch(() => [] as Warehouse[]);
  const warehouseId =
    warehouseParam && allWarehouses.some((w) => w.id === warehouseParam)
      ? warehouseParam
      : undefined;

  let productId: string | undefined;
  let skuProduct: Product | null = null;
  if (sku) {
    skuProduct = await getProductBySku(sku);
    if (!skuProduct) {
      return (
        <DocumentList
          title="Stock moves"
          subtitle={`Filtered to SKU ${sku}. Atomic inventory ledger.`}
          primaryAction={
            <RoleHomeActions
              actions={[
                {
                  label: th("newGrn"),
                  href: `/${locale}/purchasing/goods-receipts/new`,
                  operation: "create_goods_receipt",
                  primary: true,
                },
                {
                  label: th("newDelivery"),
                  href: `/${locale}/sales/deliveries/new`,
                  operation: "create_delivery_note",
                },
                {
                  label: th("newTransfer"),
                  href: `/${locale}/inventory/transfers/new`,
                  operation: "create_internal_transfer",
                },
              ]}
            />
          }
          filters={
            <ListWarehouseFilter
              current={warehouseId ?? null}
              warehouses={allWarehouses.map((w) => ({ id: w.id, name: w.name }))}
            />
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
            rows={[]}
            emptyMessage={t("empty.stockMoves")}
            serverPagination={{ page, pageSize: limit, total: 0 }}
          />
        </DocumentList>
      );
    }
    productId = skuProduct.id;
  }

  const { items: moves, total } = await listStockMovesPage({
    limit,
    offset,
    productId,
    warehouseId,
  });

  const [products, warehouses] = await Promise.all([
    skuProduct
      ? Promise.resolve(new Map([[skuProduct.id, skuProduct]]))
      : productsByIds(moves.map((m) => m.productId)),
    warehousesByIds(moves.map((m) => m.warehouseId)),
  ]);

  const subtitleParts = [
    sku ? `Filtered to SKU ${sku}.` : null,
    warehouseId
      ? `Warehouse: ${allWarehouses.find((w) => w.id === warehouseId)?.name ?? warehouseId}.`
      : null,
    "Atomic inventory ledger. Every GRN, delivery, transfer and adjustment posts one or more moves.",
  ].filter(Boolean);

  return (
    <DocumentList
      title="Stock moves"
      subtitle={subtitleParts.join(" ")}
      primaryAction={
        <RoleHomeActions
          actions={[
            {
              label: th("newGrn"),
              href: `/${locale}/purchasing/goods-receipts/new`,
              operation: "create_goods_receipt",
              primary: true,
            },
            {
              label: th("newDelivery"),
              href: `/${locale}/sales/deliveries/new`,
              operation: "create_delivery_note",
            },
            {
              label: th("newTransfer"),
              href: `/${locale}/inventory/transfers/new`,
              operation: "create_internal_transfer",
            },
          ]}
        />
      }
      filters={
        <ListWarehouseFilter
          current={warehouseId ?? null}
          warehouses={allWarehouses.map((w) => ({ id: w.id, name: w.name }))}
        />
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
          const prod = products.get(m.productId);
          const wh = warehouses.get(m.warehouseId);
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
        emptyMessage={t("empty.stockMoves")}
        serverPagination={{ page, pageSize: limit, total }}
      />
    </DocumentList>
  );
}
