/**
 * Builds the global-search index from all seeded documents, products,
 * settings sub-pages, and a hardcoded action list.
 *
 * Backend will replace this with a real search service that returns the
 * same SearchResult[] shape.
 */

import {
  GOODS_RECEIPTS,
  PURCHASE_ORDERS,
  PURCHASE_REQUISITIONS,
  VENDOR_BILLS,
  VENDOR_PAYMENTS,
} from "@/mocks/seed/p2p";
import {
  CUSTOMER_INVOICES,
  CUSTOMER_RECEIPTS,
  DELIVERY_NOTES,
  QUOTES,
  SALES_ORDERS,
} from "@/mocks/seed/q2c";
import {
  CREDIT_NOTES,
  CUSTOMER_RETURNS,
  DEBIT_NOTES,
  VENDOR_RETURNS,
} from "@/mocks/seed/returns";
import { RFQS } from "@/mocks/seed/rfq";
import {
  INTERNAL_TRANSFERS,
  STOCK_ADJUSTMENTS,
  STOCK_MOVES,
} from "@/mocks/seed/inv";
import { JOURNAL_ENTRIES } from "@/mocks/seed/gl";
import { CUSTOMERS, PRODUCTS, SUPPLIERS } from "@/mocks/seed/master";
import type { SearchResult } from "@/types/search";

const ACTIONS: SearchResult[] = [
  {
    id: "act_new_pr",
    kind: "action",
    label: "Create Purchase Requisition",
    subtitle: "Start the P2P chain",
    href: (l) => `/${l}/purchasing/purchase-requisitions/new`,
    keywords: ["pr", "new", "requisition", "buy", "request"],
  },
  {
    id: "act_new_rfq",
    kind: "action",
    label: "Create RFQ",
    subtitle: "Request quotes from vendors",
    href: (l) => `/${l}/purchasing/rfqs/new`,
    keywords: ["rfq", "tender", "quote", "request for quotation"],
  },
  {
    id: "act_new_po",
    kind: "action",
    label: "Create Purchase Order",
    href: (l) => `/${l}/purchasing/purchase-orders/new`,
    keywords: ["po", "new", "order"],
  },
  {
    id: "act_new_grn",
    kind: "action",
    label: "Create Goods Receipt",
    href: (l) => `/${l}/purchasing/goods-receipts/new`,
    keywords: ["grn", "receive", "receipt"],
  },
  {
    id: "act_new_bill",
    kind: "action",
    label: "Create Vendor Bill",
    href: (l) => `/${l}/purchasing/bills/new`,
    keywords: ["bill", "ap", "invoice", "vendor"],
  },
  {
    id: "act_new_payment",
    kind: "action",
    label: "Create Vendor Payment",
    href: (l) => `/${l}/purchasing/payments/new`,
    keywords: ["pay", "payment", "vendor"],
  },
  {
    id: "act_new_quote",
    kind: "action",
    label: "Create Sales Quote",
    href: (l) => `/${l}/sales/quotes/new`,
    keywords: ["quote", "qt", "sales"],
  },
  {
    id: "act_new_so",
    kind: "action",
    label: "Create Sales Order",
    href: (l) => `/${l}/sales/orders/new`,
    keywords: ["so", "order", "sales"],
  },
  {
    id: "act_new_dn",
    kind: "action",
    label: "Create Delivery Note",
    href: (l) => `/${l}/sales/deliveries/new`,
    keywords: ["dn", "delivery", "deliver", "ship"],
  },
  {
    id: "act_new_invoice",
    kind: "action",
    label: "Create Customer Invoice",
    href: (l) => `/${l}/sales/invoices/new`,
    keywords: ["invoice", "inv", "ar", "customer"],
  },
  {
    id: "act_new_receipt",
    kind: "action",
    label: "Create Customer Receipt",
    href: (l) => `/${l}/sales/receipts/new`,
    keywords: ["receipt", "rcp", "ar"],
  },
  {
    id: "act_new_je",
    kind: "action",
    label: "Create Journal Entry",
    href: (l) => `/${l}/accounting/journal-entries/new`,
    keywords: ["je", "journal", "manual"],
  },
  {
    id: "act_inbox",
    kind: "action",
    label: "Open inbox",
    href: (l) => `/${l}/inbox`,
    keywords: ["alerts", "notifications", "tasks"],
  },
  {
    id: "act_dashboard",
    kind: "action",
    label: "Open dashboard",
    href: (l) => `/${l}/dashboard`,
    keywords: ["home", "kpi", "cfo"],
  },
  {
    id: "act_close",
    kind: "action",
    label: "Open month-end close",
    href: (l) => `/${l}/accounting/close`,
    keywords: ["close", "checklist", "month end"],
  },
  {
    id: "act_recon",
    kind: "action",
    label: "Open reconciliation",
    href: (l) => `/${l}/accounting/reconciliation`,
    keywords: ["bank", "recon", "match"],
  },
];

const SETTINGS_PAGES: Array<{ slug: string; label: string; keywords?: string[] }> = [
  { slug: "company", label: "Company", keywords: ["tenant", "vat", "tax profile"] },
  { slug: "branches", label: "Branches" },
  { slug: "fiscal-calendar", label: "Fiscal calendar", keywords: ["period", "close", "year"] },
  { slug: "coa", label: "Chart of accounts", keywords: ["accounts", "ledger"] },
  { slug: "tax-codes", label: "Tax codes", keywords: ["vat", "kw", "sa", "ae"] },
  { slug: "currencies", label: "Currencies" },
  { slug: "fx-rates", label: "FX rates", keywords: ["forex", "exchange"] },
  { slug: "payment-terms", label: "Payment terms", keywords: ["net days"] },
  { slug: "sequences", label: "Document sequences", keywords: ["numbering", "format"] },
  { slug: "customers", label: "Customers", keywords: ["clients", "credit"] },
  { slug: "suppliers", label: "Suppliers", keywords: ["vendors", "wht"] },
  { slug: "products", label: "Products", keywords: ["sku", "items"] },
  { slug: "price-lists", label: "Price lists" },
  { slug: "warehouses", label: "Warehouses" },
  { slug: "bank-accounts", label: "Bank accounts", keywords: ["iban"] },
  { slug: "approval-rules", label: "Approval rules", keywords: ["routing", "chain"] },
  { slug: "users", label: "Users", keywords: ["roles", "permissions"] },
];

/** Build the in-memory index. Safe to call on every search-open. */
export async function buildSearchIndex(): Promise<SearchResult[]> {
  const out: SearchResult[] = [...ACTIONS];

  // Settings sub-pages
  for (const s of SETTINGS_PAGES) {
    out.push({
      id: `set_${s.slug}`,
      kind: "settings",
      label: s.label,
      subtitle: `Settings · /${s.slug}`,
      href: (l) => `/${l}/settings/${s.slug}`,
      keywords: ["settings", ...(s.keywords ?? [])],
    });
  }

  // Products → Product 360
  for (const p of PRODUCTS) {
    out.push({
      id: `prod_${p.id}`,
      kind: "product",
      label: `${p.sku} · ${p.name}`,
      subtitle: `Product 360 · ${p.uom}`,
      href: (l) => `/${l}/inventory/products/${encodeURIComponent(p.sku)}`,
      keywords: [p.sku, p.name, p.uom],
    });
  }

  // Helper to push a doc result
  const pushDoc = (
    id: string,
    label: string,
    subtitle: string,
    href: (l: string) => string,
    extra?: string[],
  ) =>
    out.push({
      id,
      kind: "doc",
      label,
      subtitle,
      href,
      keywords: extra,
    });

  for (const x of PURCHASE_REQUISITIONS)
    pushDoc(
      `pr_${x.id}`,
      x.number,
      `PR · ${x.state}`,
      (l) => `/${l}/purchasing/purchase-requisitions/${x.id}`,
      [x.id, "pr"],
    );
  for (const x of RFQS)
    pushDoc(`rfq_${x.id}`, x.number, `RFQ · ${x.state}`, (l) => `/${l}/purchasing/rfqs/${x.id}`, [x.id, "rfq"]);
  for (const x of PURCHASE_ORDERS) {
    const sup = SUPPLIERS.find((s) => s.id === x.supplierId);
    pushDoc(
      `po_${x.id}`,
      x.number,
      `PO · ${sup?.name ?? x.supplierId} · ${x.state}`,
      (l) => `/${l}/purchasing/purchase-orders/${x.id}`,
      [x.id, "po", sup?.name ?? ""],
    );
  }
  for (const x of GOODS_RECEIPTS)
    pushDoc(`grn_${x.id}`, x.number, `GRN · ${x.state}`, (l) => `/${l}/purchasing/goods-receipts/${x.id}`, [x.id, "grn"]);
  for (const x of VENDOR_BILLS) {
    const sup = SUPPLIERS.find((s) => s.id === x.supplierId);
    pushDoc(
      `vb_${x.id}`,
      x.number,
      `Bill · ${sup?.name ?? ""} · ${x.invoiceNumber} · ${x.state}`,
      (l) => `/${l}/purchasing/bills/${x.id}`,
      [x.id, "bill", x.invoiceNumber],
    );
  }
  for (const x of VENDOR_PAYMENTS)
    pushDoc(`vp_${x.id}`, x.number, `Payment · ${x.state}`, (l) => `/${l}/purchasing/payments/${x.id}`, [x.id, "payment"]);
  for (const x of VENDOR_RETURNS)
    pushDoc(
      `vret_${x.id}`,
      x.number,
      `Vendor return · ${x.state}`,
      (l) => `/${l}/purchasing/vendor-returns/${x.id}`,
      [x.id, "return"],
    );
  for (const x of DEBIT_NOTES)
    pushDoc(`dnote_${x.id}`, x.number, `Debit note · ${x.state}`, (l) => `/${l}/purchasing/debit-notes/${x.id}`, [x.id, "debit"]);

  for (const x of QUOTES) {
    const cust = CUSTOMERS.find((c) => c.id === x.customerId);
    pushDoc(`qt_${x.id}`, x.number, `Quote · ${cust?.name ?? ""} · ${x.state}`, (l) => `/${l}/sales/quotes/${x.id}`, [
      x.id,
      "quote",
      cust?.name ?? "",
    ]);
  }
  for (const x of SALES_ORDERS) {
    const cust = CUSTOMERS.find((c) => c.id === x.customerId);
    pushDoc(`so_${x.id}`, x.number, `SO · ${cust?.name ?? ""} · ${x.state}`, (l) => `/${l}/sales/orders/${x.id}`, [
      x.id,
      "so",
      cust?.name ?? "",
    ]);
  }
  for (const x of DELIVERY_NOTES)
    pushDoc(`dn_${x.id}`, x.number, `Delivery · ${x.state}`, (l) => `/${l}/sales/deliveries/${x.id}`, [x.id, "delivery"]);
  for (const x of CUSTOMER_INVOICES) {
    const cust = CUSTOMERS.find((c) => c.id === x.customerId);
    pushDoc(
      `ci_${x.id}`,
      x.number,
      `Invoice · ${cust?.name ?? ""} · ${x.state}`,
      (l) => `/${l}/sales/invoices/${x.id}`,
      [x.id, "invoice", cust?.name ?? ""],
    );
  }
  for (const x of CUSTOMER_RECEIPTS)
    pushDoc(`cr_${x.id}`, x.number, `Receipt · ${x.state}`, (l) => `/${l}/sales/receipts/${x.id}`, [x.id, "receipt"]);
  for (const x of CUSTOMER_RETURNS)
    pushDoc(`cret_${x.id}`, x.number, `Customer return · ${x.state}`, (l) => `/${l}/sales/returns/${x.id}`, [x.id, "return"]);
  for (const x of CREDIT_NOTES)
    pushDoc(`cnote_${x.id}`, x.number, `Credit note · ${x.state}`, (l) => `/${l}/sales/credit-notes/${x.id}`, [x.id, "credit"]);

  for (const x of JOURNAL_ENTRIES)
    pushDoc(`je_${x.id}`, x.number, `JE · ${x.state}`, (l) => `/${l}/accounting/journal-entries/${x.id}`, [x.id, "je"]);
  for (const x of STOCK_MOVES)
    pushDoc(`sm_${x.id}`, x.number, `Stock move · ${x.direction === "in" ? "+" : "-"}${x.qty}`, (l) => `/${l}/inventory/stock-moves`, [
      x.id,
      "stock",
    ]);
  for (const x of INTERNAL_TRANSFERS)
    pushDoc(`trx_${x.id}`, x.number, `Transfer · ${x.state}`, (l) => `/${l}/inventory/transfers/${x.id}`, [x.id, "transfer"]);
  for (const x of STOCK_ADJUSTMENTS)
    pushDoc(`adj_${x.id}`, x.number, `Adjustment · ${x.state}`, (l) => `/${l}/inventory/adjustments/${x.id}`, [x.id, "adjustment"]);

  return out;
}
