import type {
  CustomerInvoice,
  CustomerReceipt,
  DeliveryNote,
  Opportunity,
  Quote,
  SalesOrder,
} from "@/types";
import { getTable, listTable } from "@/lib/db/read";
import { Q2C_SELECTS } from "@/lib/db/selects";

const docOrder = [
  { column: "date", ascending: false },
  { column: "number", ascending: false },
  { column: "id" },
];

export async function listOpportunities(): Promise<Opportunity[]> {
  return listTable("opportunities", Q2C_SELECTS.opportunities, [
    { column: "number", ascending: false },
    { column: "id" },
  ]);
}
export async function getOpportunity(id: string): Promise<Opportunity | null> {
  return getTable("opportunities", Q2C_SELECTS.opportunities, id);
}

export async function listQuotes(): Promise<Quote[]> {
  return listTable("quotes", Q2C_SELECTS.quotes, docOrder);
}
export async function getQuote(id: string): Promise<Quote | null> {
  return getTable("quotes", Q2C_SELECTS.quotes, id);
}

export async function listSalesOrders(): Promise<SalesOrder[]> {
  return listTable("sales_orders", Q2C_SELECTS.salesOrders, docOrder);
}
export async function getSalesOrder(id: string): Promise<SalesOrder | null> {
  return getTable("sales_orders", Q2C_SELECTS.salesOrders, id);
}

export async function listDeliveryNotes(): Promise<DeliveryNote[]> {
  return listTable("delivery_notes", Q2C_SELECTS.deliveryNotes, docOrder);
}
export async function getDeliveryNote(id: string): Promise<DeliveryNote | null> {
  return getTable("delivery_notes", Q2C_SELECTS.deliveryNotes, id);
}

export async function listCustomerInvoices(): Promise<CustomerInvoice[]> {
  return listTable("customer_invoices", Q2C_SELECTS.customerInvoices, docOrder);
}
export async function getCustomerInvoice(id: string): Promise<CustomerInvoice | null> {
  return getTable("customer_invoices", Q2C_SELECTS.customerInvoices, id);
}

export async function listCustomerReceipts(): Promise<CustomerReceipt[]> {
  return listTable("customer_receipts", Q2C_SELECTS.customerReceipts, docOrder);
}
export async function getCustomerReceipt(id: string): Promise<CustomerReceipt | null> {
  return getTable("customer_receipts", Q2C_SELECTS.customerReceipts, id);
}
