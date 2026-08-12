import {
  CUSTOMER_INVOICES,
  CUSTOMER_RECEIPTS,
  DELIVERY_NOTES,
  OPPORTUNITIES,
  QUOTES,
  SALES_ORDERS,
} from "@/mocks/seed/q2c";
import type {
  CustomerInvoice,
  CustomerReceipt,
  DeliveryNote,
  Opportunity,
  Quote,
  SalesOrder,
} from "@/types";

const byId = <T extends { id: string }>(rows: T[], id: string) =>
  rows.find((r) => r.id === id) ?? null;

export async function listOpportunities(): Promise<Opportunity[]> {
  return OPPORTUNITIES;
}
export async function getOpportunity(id: string): Promise<Opportunity | null> {
  return byId(OPPORTUNITIES, id);
}

export async function listQuotes(): Promise<Quote[]> {
  return QUOTES;
}
export async function getQuote(id: string): Promise<Quote | null> {
  return byId(QUOTES, id);
}

export async function listSalesOrders(): Promise<SalesOrder[]> {
  return SALES_ORDERS;
}
export async function getSalesOrder(id: string): Promise<SalesOrder | null> {
  return byId(SALES_ORDERS, id);
}

export async function listDeliveryNotes(): Promise<DeliveryNote[]> {
  return DELIVERY_NOTES;
}
export async function getDeliveryNote(id: string): Promise<DeliveryNote | null> {
  return byId(DELIVERY_NOTES, id);
}

export async function listCustomerInvoices(): Promise<CustomerInvoice[]> {
  return CUSTOMER_INVOICES;
}
export async function getCustomerInvoice(id: string): Promise<CustomerInvoice | null> {
  return byId(CUSTOMER_INVOICES, id);
}

export async function listCustomerReceipts(): Promise<CustomerReceipt[]> {
  return CUSTOMER_RECEIPTS;
}
export async function getCustomerReceipt(id: string): Promise<CustomerReceipt | null> {
  return byId(CUSTOMER_RECEIPTS, id);
}
