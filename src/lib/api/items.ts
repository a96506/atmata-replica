/**
 * Atmata — per-item (per-SKU) read API.
 *
 * Aggregates across stock moves, POs, GRNs, DNs, Customer Invoices to
 * answer "what has happened to this SKU?" — feeds the Product 360 page.
 *
 * All reads from mock seeds; backend mirrors the same shapes.
 */

import {
  GOODS_RECEIPTS,
  PURCHASE_ORDERS,
  VENDOR_BILLS,
} from "@/mocks/seed/p2p";
import {
  CUSTOMER_INVOICES,
  DELIVERY_NOTES,
  SALES_ORDERS,
} from "@/mocks/seed/q2c";
import { STOCK_MOVES } from "@/mocks/seed/inv";
import {
  CUSTOMERS,
  PRODUCTS,
  SUPPLIERS,
  WAREHOUSES,
} from "@/mocks/seed/master";

export type ItemSnapshot = {
  productId: string;
  sku: string;
  name: string;
  uom: string;
  costingMethod: string;
  lotTracked: boolean;
  onHand: number;
  lastCost: number | null;
  lastSalePrice: number | null;
  openPoLines: number;
  openSoLines: number;
};

export type ItemWarehouseRow = {
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  inMoves: number;
  outMoves: number;
};

export type ItemMoveRow = {
  id: string;
  date: string;
  warehouseId: string;
  warehouseName: string;
  direction: "in" | "out";
  qty: number;
  costPerUnit: number;
  sourceType: string;
  sourceId: string;
  lotNumber?: string;
};

export type ItemLotRow = {
  lotNumber: string;
  byWarehouse: Array<{ warehouseId: string; warehouseName: string; onHand: number }>;
  totalOnHand: number;
  firstSeen: string;
  lastSeen: string;
};

export type ItemPurchaseRow = {
  docId: string;
  docNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type ItemSaleRow = {
  docId: string;
  docNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type ItemVendorRow = {
  supplierId: string;
  supplierName: string;
  qty: number;
  value: number;
  lastPrice: number;
  poCount: number;
};

export type ItemCustomerRow = {
  customerId: string;
  customerName: string;
  qty: number;
  value: number;
  lastPrice: number;
  invoiceCount: number;
};

function productById(productId: string) {
  return PRODUCTS.find((p) => p.id === productId) ?? null;
}

function warehouseName(id: string) {
  return WAREHOUSES.find((w) => w.id === id)?.name ?? id;
}

function movesForProduct(productId: string) {
  return STOCK_MOVES.filter((m) => m.productId === productId);
}

export async function getProductBySku(sku: string) {
  return PRODUCTS.find((p) => p.sku === sku) ?? null;
}

export async function getItemSnapshot(productId: string): Promise<ItemSnapshot | null> {
  const p = productById(productId);
  if (!p) return null;
  const moves = movesForProduct(productId);
  const onHand = moves.reduce((s, m) => s + (m.direction === "in" ? m.qty : -m.qty), 0);
  const lastInMove = [...moves]
    .filter((m) => m.direction === "in")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastSaleLine = CUSTOMER_INVOICES.flatMap((i) =>
    i.lines.filter((l) => l.productId === productId).map((l) => ({ inv: i, l })),
  ).sort((a, b) => b.inv.date.localeCompare(a.inv.date))[0];
  const openPoLines = PURCHASE_ORDERS.filter((po) => po.state === "confirmed" || po.state === "posted").reduce(
    (s, po) =>
      s +
      po.lines.filter((l) => {
        if (l.productId !== productId) return false;
        const received = GOODS_RECEIPTS.filter((g) => g.poId === po.id)
          .flatMap((g) => g.lines)
          .filter((gl) => gl.poLineId === l.id)
          .reduce((sum, gl) => sum + gl.qtyReceived, 0);
        return received < l.qty;
      }).length,
    0,
  );
  const openSoLines = SALES_ORDERS.filter((so) => so.state === "confirmed" || so.state === "posted").reduce(
    (s, so) =>
      s +
      so.lines.filter((l) => {
        if (l.productId !== productId) return false;
        const delivered = DELIVERY_NOTES.filter((d) => d.soId === so.id)
          .flatMap((d) => d.lines)
          .filter((dl) => dl.soLineId === l.id)
          .reduce((sum, dl) => sum + dl.qtyDelivered, 0);
        return delivered < l.qty;
      }).length,
    0,
  );
  return {
    productId: p.id,
    sku: p.sku,
    name: p.name,
    uom: p.uom,
    costingMethod: p.costingMethod,
    lotTracked: p.lotTracked,
    onHand,
    lastCost: lastInMove?.costPerUnit ?? null,
    lastSalePrice: lastSaleLine?.l.unitPrice ?? null,
    openPoLines,
    openSoLines,
  };
}

export async function getItemStockByWarehouse(productId: string): Promise<ItemWarehouseRow[]> {
  const moves = movesForProduct(productId);
  const grouped = new Map<string, ItemWarehouseRow>();
  for (const m of moves) {
    const r = grouped.get(m.warehouseId) ?? {
      warehouseId: m.warehouseId,
      warehouseName: warehouseName(m.warehouseId),
      onHand: 0,
      inMoves: 0,
      outMoves: 0,
    };
    if (m.direction === "in") {
      r.onHand += m.qty;
      r.inMoves += 1;
    } else {
      r.onHand -= m.qty;
      r.outMoves += 1;
    }
    grouped.set(m.warehouseId, r);
  }
  return Array.from(grouped.values()).sort((a, b) => b.onHand - a.onHand);
}

export async function getItemMoves(productId: string): Promise<ItemMoveRow[]> {
  const moves = movesForProduct(productId);
  return moves
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => ({
      id: m.id,
      date: m.date,
      warehouseId: m.warehouseId,
      warehouseName: warehouseName(m.warehouseId),
      direction: m.direction,
      qty: m.qty,
      costPerUnit: m.costPerUnit,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      lotNumber: m.lotNumber,
    }));
}

export async function getItemLots(productId: string): Promise<ItemLotRow[]> {
  const moves = movesForProduct(productId).filter((m) => m.lotNumber);
  const byLot = new Map<string, ItemLotRow>();
  for (const m of moves) {
    const key = m.lotNumber!;
    const row = byLot.get(key) ?? {
      lotNumber: key,
      byWarehouse: [],
      totalOnHand: 0,
      firstSeen: m.date,
      lastSeen: m.date,
    };
    const wh = row.byWarehouse.find((w) => w.warehouseId === m.warehouseId);
    const delta = m.direction === "in" ? m.qty : -m.qty;
    if (wh) wh.onHand += delta;
    else
      row.byWarehouse.push({
        warehouseId: m.warehouseId,
        warehouseName: warehouseName(m.warehouseId),
        onHand: delta,
      });
    row.totalOnHand += delta;
    if (m.date < row.firstSeen) row.firstSeen = m.date;
    if (m.date > row.lastSeen) row.lastSeen = m.date;
    byLot.set(key, row);
  }
  return Array.from(byLot.values()).sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));
}

export async function getItemPurchaseHistory(productId: string): Promise<ItemPurchaseRow[]> {
  const rows: ItemPurchaseRow[] = [];
  for (const po of PURCHASE_ORDERS) {
    for (const l of po.lines) {
      if (l.productId !== productId) continue;
      const sup = SUPPLIERS.find((s) => s.id === po.supplierId);
      rows.push({
        docId: po.id,
        docNumber: po.number,
        date: po.date,
        supplierId: po.supplierId,
        supplierName: sup?.name ?? po.supplierId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        total: l.qty * l.unitPrice,
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getItemSalesHistory(productId: string): Promise<ItemSaleRow[]> {
  const rows: ItemSaleRow[] = [];
  for (const inv of CUSTOMER_INVOICES) {
    for (const l of inv.lines) {
      if (l.productId !== productId) continue;
      const cust = CUSTOMERS.find((c) => c.id === inv.customerId);
      rows.push({
        docId: inv.id,
        docNumber: inv.number,
        date: inv.date,
        customerId: inv.customerId,
        customerName: cust?.name ?? inv.customerId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        total: l.qty * l.unitPrice,
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getItemVendors(productId: string): Promise<ItemVendorRow[]> {
  const map = new Map<string, ItemVendorRow>();
  const sortedPos = PURCHASE_ORDERS.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const po of sortedPos) {
    for (const l of po.lines) {
      if (l.productId !== productId) continue;
      const sup = SUPPLIERS.find((s) => s.id === po.supplierId);
      const row = map.get(po.supplierId) ?? {
        supplierId: po.supplierId,
        supplierName: sup?.name ?? po.supplierId,
        qty: 0,
        value: 0,
        lastPrice: 0,
        poCount: 0,
      };
      row.qty += l.qty;
      row.value += l.qty * l.unitPrice;
      row.lastPrice = l.unitPrice; // sorted ascending → final assignment is most recent
      row.poCount += 1;
      map.set(po.supplierId, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export async function getItemCustomers(productId: string): Promise<ItemCustomerRow[]> {
  const map = new Map<string, ItemCustomerRow>();
  const sortedInvs = CUSTOMER_INVOICES.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const inv of sortedInvs) {
    for (const l of inv.lines) {
      if (l.productId !== productId) continue;
      const cust = CUSTOMERS.find((c) => c.id === inv.customerId);
      const row = map.get(inv.customerId) ?? {
        customerId: inv.customerId,
        customerName: cust?.name ?? inv.customerId,
        qty: 0,
        value: 0,
        lastPrice: 0,
        invoiceCount: 0,
      };
      row.qty += l.qty;
      row.value += l.qty * l.unitPrice;
      row.lastPrice = l.unitPrice;
      row.invoiceCount += 1;
      map.set(inv.customerId, row);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

// Suppress unused-import lint for VENDOR_BILLS (kept for symmetry with q2c).
void VENDOR_BILLS;
