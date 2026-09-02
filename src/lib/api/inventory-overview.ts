import { getCompanyOnHandByProduct } from "@/lib/api/items";
import { refreshMetricsIfStale } from "@/lib/api/metrics-refresh";
import {
  listCustomers,
  listProducts,
  listSuppliers,
  listWarehouses,
} from "@/lib/api/master";
import { listGoodsReceipts, listPurchaseOrders } from "@/lib/api/p2p";
import { listDeliveryNotes, listSalesOrders } from "@/lib/api/q2c";
import { listTable } from "@/lib/db/read";
import { INVENTORY_SELECTS } from "@/lib/db/selects";

export type InventoryOverview = {
  stock: Array<{
    sku: string;
    name: string;
    on_hand: number;
    min: number;
    max: number | null;
    abc: "A" | "B" | "C";
  }>;
  reorder_alerts: Array<{
    sku: string;
    name: string;
    short_by: number;
    severity: "critical" | "medium";
  }>;
  /** Computed from outbound stock moves (90d avg × horizon). */
  forecasts: Array<{
    sku: string;
    name: string;
    d30: number;
    d90: number;
    warehouse?: string;
  }>;
  /** True when per-warehouse forecast rows exist (show warehouse column). */
  showWarehouseForecasts: boolean;
  inbound: Array<{
    ref: string;
    po: string;
    partner: string;
    eta: string;
    state: "late" | "on_track";
  }>;
  outbound: Array<{
    ref: string;
    so: string;
    partner: string;
    ship_date: string;
    state: "delayed" | "ready";
  }>;
};


type InventoryForecastRow = {
  productId: string;
  warehouseId: string | null;
  forecastQty: number;
  horizonDays: number;
};

async function listInventoryForecasts(): Promise<InventoryForecastRow[]> {
  return listTable<InventoryForecastRow>(
    "inventory_forecasts",
    INVENTORY_SELECTS.inventory_forecasts,
    [{ column: "horizon_days", ascending: true }],
  ).catch(() => []);
}

type ForecastPivot = {
  forecasts: InventoryOverview["forecasts"];
  showWarehouseForecasts: boolean;
};

function pivotForecasts(
  rows: InventoryForecastRow[],
  products: Awaited<ReturnType<typeof listProducts>>,
  warehouses: Awaited<ReturnType<typeof listWarehouses>>,
): ForecastPivot {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]));
  const showWarehouseForecasts = rows.some((r) => r.warehouseId != null);
  const sourceRows = showWarehouseForecasts
    ? rows.filter((r) => r.warehouseId != null)
    : rows.filter((r) => r.warehouseId == null);

  const byKey = new Map<
    string,
    { productId: string; warehouseId: string | null; d30?: number; d90?: number }
  >();

  for (const row of sourceRows) {
    const key = showWarehouseForecasts
      ? `${row.productId}:${row.warehouseId}`
      : row.productId;
    const entry = byKey.get(key) ?? {
      productId: row.productId,
      warehouseId: row.warehouseId,
    };
    if (row.horizonDays === 30) entry.d30 = Number(row.forecastQty);
    if (row.horizonDays === 90) entry.d90 = Number(row.forecastQty);
    byKey.set(key, entry);
  }

  const forecasts = [...byKey.values()]
    .map((horizons) => {
      const product = productById.get(horizons.productId);
      if (!product || horizons.d30 == null || horizons.d90 == null) return null;
      const row: InventoryOverview["forecasts"][number] = {
        sku: product.sku,
        name: product.name,
        d30: horizons.d30,
        d90: horizons.d90,
      };
      if (showWarehouseForecasts && horizons.warehouseId) {
        row.warehouse = warehouseName.get(horizons.warehouseId) ?? horizons.warehouseId;
      }
      return row;
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return { forecasts, showWarehouseForecasts };
}

/** On-hand per product via batch RPC `company_on_hand_by_product()`. */
async function companyOnHandMap(): Promise<Map<string, number>> {
  try {
    const rows = await getCompanyOnHandByProduct();
    return new Map(rows.map((r) => [r.productId, Number(r.onHand ?? 0)]));
  } catch {
    return new Map();
  }
}

export async function getInventoryOverview(): Promise<InventoryOverview> {
  await refreshMetricsIfStale().catch(() => {});

  const [products, grns, dns, pos, sos, suppliers, customers, warehouses, forecastRows] =
    await Promise.all([
      listProducts().catch(() => []),
      listGoodsReceipts().catch(() => []),
      listDeliveryNotes().catch(() => []),
      listPurchaseOrders().catch(() => []),
      listSalesOrders().catch(() => []),
      listSuppliers().catch(() => []),
      listCustomers().catch(() => []),
      listWarehouses().catch(() => []),
      listInventoryForecasts(),
    ]);

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const poNumber = new Map(pos.map((p) => [p.id, p.number]));
  const soNumber = new Map(sos.map((s) => [s.id, s.number]));
  const onHand = await companyOnHandMap();
  const today = new Date().toISOString().slice(0, 10);

  const stock = products.map((p) => {
    const oh = onHand.get(p.id) ?? 0;
    const min = Number(p.reorderPoint ?? 0);
    const abc = (p.abcClass === "A" || p.abcClass === "B" || p.abcClass === "C"
      ? p.abcClass
      : "C") as "A" | "B" | "C";
    return {
      sku: p.sku,
      name: p.name,
      on_hand: oh,
      min,
      // No backend — deferred: products have reorder_point only (no max_stock).
      max: null as number | null,
      abc,
    };
  });

  const reorder_alerts = stock
    .filter((s) => s.min > 0 && s.on_hand < s.min)
    .map((s) => {
      const short_by = s.min - s.on_hand;
      return {
        sku: s.sku,
        name: s.name,
        short_by,
        severity:
          short_by > s.min * 0.5
            ? ("critical" as const)
            : ("medium" as const),
      };
    });

  const inbound = grns
    .filter((g) => g.state !== "posted" && g.state !== "cancelled" && g.state !== "archived")
    .map((g) => {
      const po = pos.find((p) => p.id === g.poId);
      const eta = po?.expectedDate ?? g.date;
      const late = eta < today && g.state !== "confirmed";
      return {
        ref: g.number,
        po: poNumber.get(g.poId) ?? g.poId,
        partner: supplierName.get(g.supplierId) ?? "—",
        eta,
        state: (late ? "late" : "on_track") as "late" | "on_track",
      };
    });

  const outbound = dns
    .filter((d) => d.state !== "posted" && d.state !== "cancelled" && d.state !== "archived")
    .map((d) => {
      const delayed = d.date < today && d.state !== "confirmed";
      return {
        ref: d.number,
        so: soNumber.get(d.soId) ?? d.soId,
        partner: customerName.get(d.customerId) ?? "—",
        ship_date: d.date,
        state: (delayed ? "delayed" : "ready") as "delayed" | "ready",
      };
    });

  const { forecasts, showWarehouseForecasts } = pivotForecasts(
    forecastRows,
    products,
    warehouses,
  );

  return {
    stock,
    reorder_alerts,
    forecasts,
    showWarehouseForecasts,
    inbound,
    outbound,
  };
}
