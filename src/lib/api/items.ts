import type { Product } from "@/types";
import {
  DataReadError,
  getReadClient,
  mapOne,
  mapRows,
  maybeOne,
  rpcRows,
} from "@/lib/db/read";
import { MASTER_SELECTS } from "@/lib/db/selects";

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
  lotNumber?: string | null;
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

export async function getProductBySku(sku: string): Promise<Product | null> {
  const client = await getReadClient();
  const result = await client.database
    .from("products")
    .select(MASTER_SELECTS.products)
    .eq("sku", sku)
    .maybeSingle();
  return mapOne<Product>(maybeOne(result, "product by SKU"));
}

export async function getItemSnapshot(productId: string): Promise<ItemSnapshot | null> {
  const client = await getReadClient();
  const result = await client.database.rpc("item_snapshot", {
    p_product_id: productId,
  });
  if (result.error) {
    const message = String(result.error.message ?? "").toLowerCase();
    if (message.includes("product not found")) return null;
    throw new DataReadError("read", "item snapshot", result.error);
  }
  const rows = mapRows<ItemSnapshot>(result.data ?? []);
  return rows[0] ?? null;
}

export function getItemStockByWarehouse(productId: string): Promise<ItemWarehouseRow[]> {
  return rpcRows("item_stock_by_warehouse", { p_product_id: productId });
}

export function getItemMoves(productId: string): Promise<ItemMoveRow[]> {
  return rpcRows("item_moves", { p_product_id: productId });
}

export function getItemLots(productId: string): Promise<ItemLotRow[]> {
  return rpcRows("item_lots", { p_product_id: productId });
}

export function getItemPurchaseHistory(productId: string): Promise<ItemPurchaseRow[]> {
  return rpcRows("item_purchase_history", { p_product_id: productId });
}

export function getItemSalesHistory(productId: string): Promise<ItemSaleRow[]> {
  return rpcRows("item_sales_history", { p_product_id: productId });
}

export function getItemVendors(productId: string): Promise<ItemVendorRow[]> {
  return rpcRows("item_vendors", { p_product_id: productId });
}

export function getItemCustomers(productId: string): Promise<ItemCustomerRow[]> {
  return rpcRows("item_customers", { p_product_id: productId });
}
