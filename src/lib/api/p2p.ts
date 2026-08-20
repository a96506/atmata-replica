import type {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseRequisition,
  VendorBill,
  VendorPayment,
} from "@/types";
import { getTable, listTable } from "@/lib/db/read";
import { P2P_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

export async function listPurchaseRequisitions(): Promise<PurchaseRequisition[]> {
  return listTable("purchase_requisitions", P2P_SELECTS.purchaseRequisitions, docOrder);
}
export async function getPurchaseRequisition(id: string): Promise<PurchaseRequisition | null> {
  return getTable("purchase_requisitions", P2P_SELECTS.purchaseRequisitions, id);
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return listTable("purchase_orders", P2P_SELECTS.purchaseOrders, docOrder);
}
export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  return getTable("purchase_orders", P2P_SELECTS.purchaseOrders, id);
}

export async function listGoodsReceipts(): Promise<GoodsReceipt[]> {
  return listTable("goods_receipts", P2P_SELECTS.goodsReceipts, docOrder);
}
export async function getGoodsReceipt(id: string): Promise<GoodsReceipt | null> {
  return getTable("goods_receipts", P2P_SELECTS.goodsReceipts, id);
}

export async function listVendorBills(): Promise<VendorBill[]> {
  return listTable("vendor_bills", P2P_SELECTS.vendorBills, docOrder);
}
export async function getVendorBill(id: string): Promise<VendorBill | null> {
  return getTable("vendor_bills", P2P_SELECTS.vendorBills, id);
}

export async function listVendorPayments(): Promise<VendorPayment[]> {
  return listTable("vendor_payments", P2P_SELECTS.vendorPayments, docOrder);
}
export async function getVendorPayment(id: string): Promise<VendorPayment | null> {
  return getTable("vendor_payments", P2P_SELECTS.vendorPayments, id);
}
