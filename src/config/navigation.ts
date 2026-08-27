import {
  Banknote,
  Boxes,
  Building2,
  CalendarRange,
  ClipboardList,
  Coins,
  CreditCard,
  FileBadge,
  FileMinus,
  FileText,
  Gauge,
  Inbox,
  Landmark,
  LayoutGrid,
  ListOrdered,
  Package,
  PackageCheck,
  Percent,
  ReceiptText,
  Repeat,
  RotateCcw,
  Ruler,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tags,
  Truck,
  Users,
  UsersRound,
  Warehouse,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for application navigation.
 *
 * Drives the sidebar, breadcrumbs, and the command palette so a new route only
 * needs to be declared once. `labelKey` values resolve against the `nav` /
 * module namespaces in `messages/*.json`; `label` is the English fallback used
 * where no translation key exists yet.
 */

export type NavLeaf = {
  href: string;
  label: string;
  /** Translation key under the `nav` namespace; resolves to the leaf label. */
  labelKey?: string;
  icon?: LucideIcon;
  /** Shown in the command palette to disambiguate similarly named routes. */
  keywords?: string[];
};

export type NavGroup = {
  /** Optional heading used for nested groups (e.g. inside Settings). */
  label?: string;
  /** Translation key under the `nav.groups` namespace for this heading. */
  labelKey?: string;
  items: NavLeaf[];
};

export type NavModule = {
  /** Route segment, also used as the `nav` translation key. */
  key: string;
  href: string;
  label: string;
  /** Translation key under the `nav` namespace; defaults to `key`. */
  labelKey?: string;
  icon: LucideIcon;
  /** Grouped children. A module with a single unlabelled group renders flat. */
  groups: NavGroup[];
};

export const navigation: NavModule[] = [
  {
    key: "inbox",
    href: "/inbox",
    label: "AI Inbox",
    icon: Inbox,
    groups: [
      {
        items: [
          { href: "/inbox", label: "Inbox", labelKey: "inbox", icon: Inbox, keywords: ["ai", "queue", "tasks"] },
        ],
      },
    ],
  },
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: Gauge,
    groups: [
      {
        items: [
          { href: "/dashboard", label: "Overview", labelKey: "overview", icon: Gauge, keywords: ["kpi", "home", "metrics"] },
        ],
      },
    ],
  },
  {
    key: "sales",
    href: "/sales",
    label: "Sales",
    icon: ShoppingCart,
    groups: [
      {
        items: [{ href: "/sales", label: "Overview", labelKey: "overview", icon: LayoutGrid }],
      },
      {
        label: "Order to cash",
        labelKey: "order_to_cash",
        items: [
          { href: "/sales/quotes", label: "Quotes", labelKey: "quotes", icon: FileText, keywords: ["quotation", "q2c"] },
          { href: "/sales/orders", label: "Sales orders", labelKey: "sales_orders", icon: ClipboardList, keywords: ["so"] },
          { href: "/sales/deliveries", label: "Deliveries", labelKey: "deliveries", icon: Truck, keywords: ["dn", "shipment"] },
          {
            href: "/sales/invoices",
            label: "Customer invoices",
            labelKey: "customer_invoices",
            icon: ReceiptText,
            keywords: ["ar", "billing"],
          },
          {
            href: "/sales/receipts",
            label: "Customer receipts",
            labelKey: "customer_receipts",
            icon: Wallet,
            keywords: ["payment", "collection"],
          },
        ],
      },
      {
        label: "Reversals",
        labelKey: "reversals",
        items: [
          { href: "/sales/returns", label: "Customer returns", labelKey: "customer_returns", icon: RotateCcw },
          { href: "/sales/credit-notes", label: "Credit notes", labelKey: "credit_notes", icon: FileMinus },
        ],
      },
    ],
  },
  {
    key: "purchasing",
    href: "/purchasing",
    label: "Purchasing",
    icon: Package,
    groups: [
      {
        items: [{ href: "/purchasing", label: "Overview", labelKey: "overview", icon: LayoutGrid }],
      },
      {
        label: "Procure to pay",
        labelKey: "procure_to_pay",
        items: [
          {
            href: "/purchasing/purchase-requisitions",
            label: "Purchase requisitions",
            labelKey: "purchase_requisitions",
            icon: ClipboardList,
            keywords: ["pr", "request"],
          },
          { href: "/purchasing/rfqs", label: "RFQs", labelKey: "rfqs", icon: FileBadge, keywords: ["quotation", "bid"] },
          {
            href: "/purchasing/purchase-orders",
            label: "Purchase orders",
            labelKey: "purchase_orders",
            icon: ScrollText,
            keywords: ["po"],
          },
          {
            href: "/purchasing/goods-receipts",
            label: "Goods receipts",
            labelKey: "goods_receipts",
            icon: PackageCheck,
            keywords: ["grn", "receiving"],
          },
          { href: "/purchasing/bills", label: "Vendor bills", labelKey: "vendor_bills", icon: ReceiptText, keywords: ["ap"] },
          {
            href: "/purchasing/payments",
            label: "Vendor payments",
            labelKey: "vendor_payments",
            icon: CreditCard,
            keywords: ["pay", "remittance"],
          },
        ],
      },
      {
        label: "Reversals",
        labelKey: "reversals",
        items: [
          { href: "/purchasing/vendor-returns", label: "Vendor returns", labelKey: "vendor_returns", icon: RotateCcw },
          { href: "/purchasing/debit-notes", label: "Debit notes", labelKey: "debit_notes", icon: FileMinus },
        ],
      },
    ],
  },
  {
    key: "inventory",
    href: "/inventory",
    label: "Inventory",
    icon: Boxes,
    groups: [
      {
        items: [
          { href: "/inventory", label: "Overview", labelKey: "overview", icon: LayoutGrid },
          {
            href: "/inventory/stock-moves",
            label: "Stock moves",
            labelKey: "stock_moves",
            icon: Repeat,
            keywords: ["ledger", "movement"],
          },
          { href: "/inventory/transfers", label: "Transfers", labelKey: "transfers", icon: Truck, keywords: ["move"] },
          {
            href: "/inventory/adjustments",
            label: "Adjustments",
            labelKey: "adjustments",
            icon: Ruler,
            keywords: ["count", "stocktake", "shrinkage"],
          },
        ],
      },
    ],
  },
  {
    key: "accounting",
    href: "/accounting",
    label: "Accounting",
    icon: Landmark,
    groups: [
      {
        items: [{ href: "/accounting", label: "Overview", labelKey: "overview", icon: LayoutGrid }],
      },
      {
        label: "Transactions",
        labelKey: "transactions",
        items: [
          {
            href: "/accounting/invoices",
            label: "AP invoices (OCR)",
            labelKey: "ap_invoices_ocr",
            icon: Sparkles,
            keywords: ["ocr", "scan", "bill"],
          },
          {
            href: "/accounting/journal-entries",
            label: "Journal entries",
            labelKey: "journal_entries",
            icon: ScrollText,
            keywords: ["je", "gl", "ledger"],
          },
          {
            href: "/accounting/reconciliation",
            label: "Reconciliation",
            labelKey: "reconciliation",
            icon: Banknote,
            keywords: ["bank", "match", "statement"],
          },
        ],
      },
      {
        label: "Reporting",
        labelKey: "reporting",
        items: [
          {
            href: "/accounting/financials",
            label: "Financials",
            labelKey: "financials",
            icon: FileText,
            keywords: ["p&l", "balance sheet", "trial balance"],
          },
          {
            href: "/accounting/close",
            label: "Month-end close",
            labelKey: "month_end_close",
            icon: CalendarRange,
            keywords: ["period", "closing"],
          },
        ],
      },
    ],
  },
  {
    key: "settings",
    href: "/settings",
    label: "Settings",
    icon: Settings,
    groups: [
      {
        items: [{ href: "/settings", label: "Overview", labelKey: "overview", icon: LayoutGrid }],
      },
      {
        label: "Organization",
        labelKey: "organization",
        items: [
          { href: "/settings/company", label: "Company", labelKey: "company", icon: Building2 },
          { href: "/settings/branches", label: "Branches", labelKey: "branches", icon: Building2 },
          { href: "/settings/warehouses", label: "Warehouses", labelKey: "warehouses", icon: Warehouse },
          { href: "/settings/fiscal-calendar", label: "Fiscal calendar", labelKey: "fiscal_calendar", icon: CalendarRange },
        ],
      },
      {
        label: "Finance",
        labelKey: "finance",
        items: [
          { href: "/settings/coa", label: "Chart of accounts", labelKey: "coa", icon: ListOrdered, keywords: ["coa"] },
          { href: "/settings/tax-codes", label: "Tax codes", labelKey: "tax_codes", icon: Percent, keywords: ["vat"] },
          { href: "/settings/currencies", label: "Currencies", labelKey: "currencies", icon: Coins },
          { href: "/settings/fx-rates", label: "FX rates", labelKey: "fx_rates", icon: Coins, keywords: ["exchange"] },
          { href: "/settings/payment-terms", label: "Payment terms", labelKey: "payment_terms", icon: CalendarRange },
          { href: "/settings/bank-accounts", label: "Bank accounts", labelKey: "bank_accounts", icon: Banknote },
        ],
      },
      {
        label: "Master data",
        labelKey: "master_data",
        items: [
          { href: "/settings/customers", label: "Customers", labelKey: "customers", icon: UsersRound },
          { href: "/settings/suppliers", label: "Suppliers", labelKey: "suppliers", icon: Truck, keywords: ["vendor"] },
          { href: "/settings/products", label: "Products", labelKey: "products", icon: Package, keywords: ["item", "sku"] },
          { href: "/settings/price-lists", label: "Price lists", labelKey: "price_lists", icon: Tags },
          { href: "/settings/sequences", label: "Sequences", labelKey: "sequences", icon: ListOrdered, keywords: ["numbering"] },
        ],
      },
      {
        label: "Access",
        labelKey: "access",
        items: [
          { href: "/settings/users", label: "Users", labelKey: "users", icon: Users },
          { href: "/settings/approval-rules", label: "Approval rules", labelKey: "approval_rules", icon: ShieldCheck },
        ],
      },
    ],
  },
];

/** Flat list of every navigable leaf — used by the command palette. */
export const allNavLeaves: (NavLeaf & { module: NavModule; groupLabel?: string })[] =
  navigation.flatMap((module) =>
    module.groups.flatMap((group) =>
      group.items.map((item) => ({ ...item, module, groupLabel: group.label })),
    ),
  );

/** Strip the locale prefix so config hrefs can be compared with a pathname. */
export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(en|ar)(?=\/|$)/, "") || "/";
}

/** The module that owns a given pathname. */
export function findModule(pathname: string): NavModule | undefined {
  const path = stripLocale(pathname);
  return navigation.find(
    (module) => path === module.href || path.startsWith(`${module.href}/`),
  );
}

/**
 * Deepest configured leaf matching the pathname. Detail routes such as
 * `/sales/invoices/inv_1` resolve to the `/sales/invoices` leaf.
 */
export function findLeaf(pathname: string): NavLeaf | undefined {
  const path = stripLocale(pathname);
  return allNavLeaves
    .filter((leaf) => path === leaf.href || path.startsWith(`${leaf.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export type Crumb = { href?: string; label: string };

/**
 * Breadcrumb trail for a pathname: module → section → record.
 * Unknown trailing segments (record ids, `new`) become a final non-link crumb.
 */
export function buildBreadcrumbs(pathname: string): Crumb[] {
  const path = stripLocale(pathname);
  const module = findModule(path);
  if (!module) return [];

  const crumbs: Crumb[] = [{ href: module.href, label: module.label }];

  const leaf = findLeaf(path);
  if (leaf && leaf.href !== module.href) {
    crumbs.push({ href: leaf.href, label: leaf.label });
  }

  const base = leaf?.href ?? module.href;
  const rest = path.slice(base.length).split("/").filter(Boolean);
  if (rest.length > 0) {
    const last = rest[rest.length - 1];
    crumbs.push({ label: last === "new" ? "New" : decodeURIComponent(last) });
  }

  return crumbs;
}
