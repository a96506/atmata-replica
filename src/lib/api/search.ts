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

/** Client-safe static action/settings index. Database results come from /api/search. */
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

  return out;
}

export type DatabaseSearchResult = {
  id: string;
  kind: SearchResult["kind"];
  label: string;
  subtitle?: string;
  path: string;
  keywords?: string[];
};

export function hydrateDatabaseSearchResult(row: DatabaseSearchResult): SearchResult {
  return {
    ...row,
    href: (locale) => `/${locale}${row.path}`,
  };
}
