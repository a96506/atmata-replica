import { listStockMoves } from "@/lib/api/inventory-tx";
import {
  listCustomers,
  listProducts,
  listSuppliers,
} from "@/lib/api/master";
import { listGoodsReceipts, listPurchaseOrders } from "@/lib/api/p2p";
import { listDeliveryNotes, listSalesOrders } from "@/lib/api/q2c";

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
  /**
   * No backend — deferred: no demand-forecast table/RPC
   * (products only have reorder_point + abc_class).
   */
  forecasts: Array<{
    sku: string;
    name: string;
    d30: number;
    d90: number;
  }>;
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

function onHandByProduct(
  moves: Awaited<ReturnType<typeof listStockMoves>>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of moves) {
    const delta = m.direction === "in" ? m.qty : -m.qty;
    map.set(m.productId, (map.get(m.productId) ?? 0) + delta);
  }
  return map;
}

export async function getInventoryOverview(): Promise<InventoryOverview> {
  const [products, moves, grns, dns, pos, sos, suppliers, customers] =
    await Promise.all([
      listProducts().catch(() => []),
      listStockMoves().catch(() => []),
      listGoodsReceipts().catch(() => []),
      listDeliveryNotes().catch(() => []),
      listPurchaseOrders().catch(() => []),
      listSalesOrders().catch(() => []),
      listSuppliers().catch(() => []),
      listCustomers().catch(() => []),
    ]);

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const poNumber = new Map(pos.map((p) => [p.id, p.number]));
  const soNumber = new Map(sos.map((s) => [s.id, s.number]));
  const onHand = onHandByProduct(moves);
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

  return {
    stock,
    reorder_alerts,
    forecasts: [],
    inbound,
    outbound,
  };
}
