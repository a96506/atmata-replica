import {
  GOODS_RECEIPTS,
  PURCHASE_ORDERS,
  PURCHASE_REQUISITIONS,
  VENDOR_BILLS,
  VENDOR_PAYMENTS,
} from "@/mocks/seed/p2p";
import type {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseRequisition,
  VendorBill,
  VendorPayment,
} from "@/types";

const byId = <T extends { id: string }>(rows: T[], id: string) =>
  rows.find((r) => r.id === id) ?? null;

export async function listPurchaseRequisitions(): Promise<PurchaseRequisition[]> {
  return PURCHASE_REQUISITIONS;
}
export async function getPurchaseRequisition(id: string): Promise<PurchaseRequisition | null> {
  return byId(PURCHASE_REQUISITIONS, id);
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return PURCHASE_ORDERS;
}
export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  return byId(PURCHASE_ORDERS, id);
}

export async function listGoodsReceipts(): Promise<GoodsReceipt[]> {
  return GOODS_RECEIPTS;
}
export async function getGoodsReceipt(id: string): Promise<GoodsReceipt | null> {
  return byId(GOODS_RECEIPTS, id);
}

export async function listVendorBills(): Promise<VendorBill[]> {
  return VENDOR_BILLS;
}
export async function getVendorBill(id: string): Promise<VendorBill | null> {
  return byId(VENDOR_BILLS, id);
}

export async function listVendorPayments(): Promise<VendorPayment[]> {
  return VENDOR_PAYMENTS;
}
export async function getVendorPayment(id: string): Promise<VendorPayment | null> {
  return byId(VENDOR_PAYMENTS, id);
}
