import type {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseRequisition,
  VendorBill,
  VendorPayment,
} from "@/types";
import {
  getReadClient,
  getTable,
  listPage,
  listTable,
  mapRows,
  requireData,
  type ListPageResult,
  type ReadFilter,
} from "@/lib/db/read";
import { P2P_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

// Remaining P2P lists: none (all transactional lists use listPage).

export async function listPurchaseRequisitions(): Promise<PurchaseRequisition[]> {
  return listTable("purchase_requisitions", P2P_SELECTS.purchaseRequisitions, docOrder);
}

/** One server page of PRs (same projection/order as {@link listPurchaseRequisitions}). */
export async function listPurchaseRequisitionsPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<PurchaseRequisition>> {
  return listPage(
    "purchase_requisitions",
    P2P_SELECTS.purchaseRequisitions,
    docOrder,
    [],
    { limit: params.limit, offset: params.offset },
  );
}
export async function getPurchaseRequisition(id: string): Promise<PurchaseRequisition | null> {
  return getTable("purchase_requisitions", P2P_SELECTS.purchaseRequisitions, id);
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return listTable("purchase_orders", P2P_SELECTS.purchaseOrders, docOrder);
}

/** One server page of POs (same projection/order as {@link listPurchaseOrders}). */
export async function listPurchaseOrdersPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<PurchaseOrder>> {
  return listPage("purchase_orders", P2P_SELECTS.purchaseOrders, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  return getTable("purchase_orders", P2P_SELECTS.purchaseOrders, id);
}

export async function listGoodsReceipts(): Promise<GoodsReceipt[]> {
  return listTable("goods_receipts", P2P_SELECTS.goodsReceipts, docOrder);
}

/** One server page of GRNs (same projection/order as {@link listGoodsReceipts}). */
export async function listGoodsReceiptsPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<GoodsReceipt>> {
  return listPage("goods_receipts", P2P_SELECTS.goodsReceipts, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}

/** PO numbers for the given ids only (GRN list joins — not a full PO load). */
export async function mapPurchaseOrderNumbersByIds(
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const client = await getReadClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await client.database
    .from("purchase_orders")
    .select("id,number")
    .in("id", unique);
  const rows = mapRows<{ id: string; number: string }>(
    requireData(result, "purchase_orders"),
  );
  return new Map(rows.map((row) => [row.id, row.number]));
}
export async function getGoodsReceipt(id: string): Promise<GoodsReceipt | null> {
  return getTable("goods_receipts", P2P_SELECTS.goodsReceipts, id);
}

/** Full list for export/lookups (allPages, hard-capped at 1000). */
export async function listVendorBills(options?: {
  state?: string | null;
}): Promise<VendorBill[]> {
  const filters: ReadFilter[] = options?.state
    ? [{ column: "state", value: options.state }]
    : [];
  return listTable("vendor_bills", P2P_SELECTS.vendorBills, docOrder, filters);
}

/** One server page of AP bills (same projection/order as {@link listVendorBills}). */
export async function listVendorBillsPage(params: {
  limit?: number;
  offset?: number;
  /** When set, filter at the DB via `.eq("state", …)`. */
  state?: string | null;
}): Promise<ListPageResult<VendorBill>> {
  const filters: ReadFilter[] = params.state
    ? [{ column: "state", value: params.state }]
    : [];
  return listPage(
    "vendor_bills",
    P2P_SELECTS.vendorBills,
    docOrder,
    filters,
    { limit: params.limit, offset: params.offset },
  );
}

export async function getVendorBill(id: string): Promise<VendorBill | null> {
  return getTable("vendor_bills", P2P_SELECTS.vendorBills, id);
}

/** Full list for export/lookups (allPages, hard-capped at 1000). */
export async function listVendorPayments(): Promise<VendorPayment[]> {
  return listTable("vendor_payments", P2P_SELECTS.vendorPayments, docOrder);
}

/** One server page of AP payments (same projection/order as {@link listVendorPayments}). */
export async function listVendorPaymentsPage(params: {
  limit?: number;
  offset?: number;
}): Promise<ListPageResult<VendorPayment>> {
  return listPage("vendor_payments", P2P_SELECTS.vendorPayments, docOrder, [], {
    limit: params.limit,
    offset: params.offset,
  });
}
export async function getVendorPayment(id: string): Promise<VendorPayment | null> {
  return getTable("vendor_payments", P2P_SELECTS.vendorPayments, id);
}
