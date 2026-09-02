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
import type { Role } from "@/types";
import type { WriteCapability } from "@/lib/roles/capabilities";

/**
 * Single source of truth for application navigation.
 *
 * Drives the sidebar, breadcrumbs, and the command palette so a new route only
 * needs to be declared once. `labelKey` values resolve against the `nav` /
 * module namespaces in `messages/*.json`; `label` is the English fallback used
 * where no translation key exists yet.
 */

/** Shared read access for list/overview leaves (not write desks). */
const READ_DESK: Role[] = ["viewer", "accountant", "approver"];

export type NavLeaf = {
  href: string;
  label: string;
  /** Translation key under the `nav` namespace; resolves to the leaf label. */
  labelKey?: string;
  icon?: LucideIcon;
  /** Shown in the command palette to disambiguate similarly named routes. */
  keywords?: string[];
  /**
   * Write capabilities that may see this leaf. Combined with `readRoles`.
   * Omit both to show to every signed-in user (inbox / dashboard).
   */
  capabilities?: WriteCapability[];
  /** Roles that may see the leaf without holding a write capability. */
  readRoles?: Role[];
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
        items: [
          {
            href: "/sales",
            label: "Overview",
            labelKey: "overview",
            icon: LayoutGrid,
            capabilities: ["sales_rep", "ar_clerk"],
            readRoles: [...READ_DESK, "warehouse"],
          },
        ],
      },
      {
        label: "Order to cash",
        labelKey: "order_to_cash",
        items: [
          {
            href: "/sales/quotes",
            label: "Quotes",
            labelKey: "quotes",
            icon: FileText,
            keywords: ["quotation", "q2c"],
            capabilities: ["sales_rep", "ar_clerk"],
            readRoles: READ_DESK,
          },
          {
            href: "/sales/orders",
            label: "Sales orders",
            labelKey: "sales_orders",
            icon: ClipboardList,
            keywords: ["so"],
            capabilities: ["sales_rep", "ar_clerk"],
            readRoles: READ_DESK,
          },
          {
            href: "/sales/deliveries",
            label: "Deliveries",
            labelKey: "deliveries",
            icon: Truck,
            keywords: ["dn", "shipment"],
            capabilities: ["warehouse"],
            readRoles: [...READ_DESK, "sales_rep", "ar_clerk"],
          },
          {
            href: "/sales/invoices",
            label: "Customer invoices",
            labelKey: "customer_invoices",
            icon: ReceiptText,
            keywords: ["ar", "billing"],
            capabilities: ["ar_clerk"],
            readRoles: [...READ_DESK, "sales_rep"],
          },
          {
            href: "/sales/receipts",
            label: "Customer receipts",
            labelKey: "customer_receipts",
            icon: Wallet,
            keywords: ["payment", "collection"],
            capabilities: ["ar_clerk"],
            readRoles: READ_DESK,
          },
        ],
      },
      {
        label: "Reversals",
        labelKey: "reversals",
        items: [
          {
            href: "/sales/returns",
            label: "Customer returns",
            labelKey: "customer_returns",
            icon: RotateCcw,
            capabilities: ["warehouse", "ar_clerk"],
            readRoles: READ_DESK,
          },
          {
            href: "/sales/credit-notes",
            label: "Credit notes",
            labelKey: "credit_notes",
            icon: FileMinus,
            capabilities: ["ar_clerk"],
            readRoles: READ_DESK,
          },
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
        items: [
          {
            href: "/purchasing",
            label: "Overview",
            labelKey: "overview",
            icon: LayoutGrid,
            capabilities: ["buyer", "ap_clerk", "warehouse"],
            readRoles: READ_DESK,
          },
        ],
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
            capabilities: ["buyer"],
            readRoles: READ_DESK,
          },
          {
            href: "/purchasing/rfqs",
            label: "RFQs",
            labelKey: "rfqs",
            icon: FileBadge,
            keywords: ["quotation", "bid"],
            capabilities: ["buyer"],
            readRoles: READ_DESK,
          },
          {
            href: "/purchasing/purchase-orders",
            label: "Purchase orders",
            labelKey: "purchase_orders",
            icon: ScrollText,
            keywords: ["po"],
            capabilities: ["buyer"],
            readRoles: [...READ_DESK, "warehouse", "ap_clerk"],
          },
          {
            href: "/purchasing/goods-receipts",
            label: "Goods receipts",
            labelKey: "goods_receipts",
            icon: PackageCheck,
            keywords: ["grn", "receiving"],
            capabilities: ["warehouse"],
            readRoles: [...READ_DESK, "buyer", "ap_clerk"],
          },
          {
            href: "/purchasing/bills",
            label: "Vendor bills",
            labelKey: "vendor_bills",
            icon: ReceiptText,
            keywords: ["ap"],
            capabilities: ["ap_clerk"],
            readRoles: [...READ_DESK, "buyer"],
          },
          {
            href: "/accounting/invoices",
            label: "Scan vendor bill",
            labelKey: "scan_vendor_bill",
            icon: Sparkles,
            keywords: ["ocr", "scan", "bill", "ap"],
            capabilities: ["ap_clerk"],
            readRoles: ["viewer", "approver"],
          },
          {
            href: "/purchasing/payments",
            label: "Vendor payments",
            labelKey: "vendor_payments",
            icon: CreditCard,
            keywords: ["pay", "remittance"],
            capabilities: ["ap_clerk"],
            readRoles: READ_DESK,
          },
        ],
      },
      {
        label: "Reversals",
        labelKey: "reversals",
        items: [
          {
            href: "/purchasing/vendor-returns",
            label: "Vendor returns",
            labelKey: "vendor_returns",
            icon: RotateCcw,
            capabilities: ["warehouse"],
            readRoles: [...READ_DESK, "ap_clerk", "buyer"],
          },
          {
            href: "/purchasing/debit-notes",
            label: "Debit notes",
            labelKey: "debit_notes",
            icon: FileMinus,
            capabilities: ["ap_clerk"],
            readRoles: READ_DESK,
          },
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
          {
            href: "/inventory",
            label: "Overview",
            labelKey: "overview",
            icon: LayoutGrid,
            capabilities: ["warehouse"],
            readRoles: [...READ_DESK, "buyer"],
          },
          {
            href: "/inventory/stock-moves",
            label: "Stock moves",
            labelKey: "stock_moves",
            icon: Repeat,
            keywords: ["ledger", "movement"],
            capabilities: ["warehouse"],
            readRoles: [...READ_DESK, "buyer"],
          },
          {
            href: "/inventory/transfers",
            label: "Transfers",
            labelKey: "transfers",
            icon: Truck,
            keywords: ["move"],
            capabilities: ["warehouse"],
            readRoles: READ_DESK,
          },
          {
            href: "/inventory/adjustments",
            label: "Adjustments",
            labelKey: "adjustments",
            icon: Ruler,
            keywords: ["count", "stocktake", "shrinkage"],
            capabilities: ["warehouse"],
            readRoles: READ_DESK,
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
        items: [
          {
            href: "/accounting",
            label: "Overview",
            labelKey: "overview",
            icon: LayoutGrid,
            capabilities: ["accountant", "ap_clerk"],
            readRoles: ["viewer", "approver"],
          },
        ],
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
            capabilities: ["ap_clerk", "accountant"],
            readRoles: ["viewer", "approver"],
          },
          {
            href: "/accounting/journal-entries",
            label: "Journal entries",
            labelKey: "journal_entries",
            icon: ScrollText,
            keywords: ["je", "gl", "ledger"],
            capabilities: ["accountant"],
            readRoles: ["viewer", "approver"],
          },
          {
            href: "/accounting/reconciliation",
            label: "Reconciliation",
            labelKey: "reconciliation",
            icon: Banknote,
            keywords: ["bank", "match", "statement"],
            capabilities: ["accountant"],
            readRoles: ["viewer", "approver"],
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
            capabilities: ["accountant"],
            readRoles: ["viewer", "approver"],
          },
          {
            href: "/accounting/close",
            label: "Month-end close",
            labelKey: "month_end_close",
            icon: CalendarRange,
            keywords: ["period", "closing"],
            capabilities: ["accountant"],
            readRoles: ["viewer", "approver"],
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
        items: [
          {
            href: "/settings",
            label: "Overview",
            labelKey: "overview",
            icon: LayoutGrid,
            capabilities: ["admin"],
            readRoles: ["viewer", "accountant", "ar_clerk", "ap_clerk", "buyer", "warehouse"],
          },
        ],
      },
      {
        label: "Organization",
        labelKey: "organization",
        items: [
          {
            href: "/settings/company",
            label: "Company",
            labelKey: "company",
            icon: Building2,
            capabilities: ["admin"],
            readRoles: ["viewer", "accountant"],
          },
          {
            href: "/settings/branches",
            label: "Branches",
            labelKey: "branches",
            icon: Building2,
            capabilities: ["admin"],
            readRoles: ["viewer", "accountant", "warehouse"],
          },
          {
            href: "/settings/warehouses",
            label: "Warehouses",
            labelKey: "warehouses",
            icon: Warehouse,
            capabilities: ["admin"],
            readRoles: ["viewer", "warehouse", "accountant"],
          },
          {
            href: "/settings/fiscal-calendar",
            label: "Fiscal calendar",
            labelKey: "fiscal_calendar",
            icon: CalendarRange,
            capabilities: ["accountant", "admin"],
            readRoles: ["viewer"],
          },
        ],
      },
      {
        label: "Finance",
        labelKey: "finance",
        items: [
          {
            href: "/settings/coa",
            label: "Chart of accounts",
            labelKey: "coa",
            icon: ListOrdered,
            keywords: ["coa"],
            capabilities: ["accountant"],
            readRoles: ["viewer"],
          },
          {
            href: "/settings/tax-codes",
            label: "Tax codes",
            labelKey: "tax_codes",
            icon: Percent,
            keywords: ["vat"],
            capabilities: ["accountant"],
            readRoles: ["viewer"],
          },
          {
            href: "/settings/currencies",
            label: "Currencies",
            labelKey: "currencies",
            icon: Coins,
            capabilities: ["accountant"],
            readRoles: ["viewer"],
          },
          {
            href: "/settings/fx-rates",
            label: "FX rates",
            labelKey: "fx_rates",
            icon: Coins,
            keywords: ["exchange"],
            capabilities: ["accountant"],
            readRoles: ["viewer"],
          },
          {
            href: "/settings/payment-terms",
            label: "Payment terms",
            labelKey: "payment_terms",
            icon: CalendarRange,
            capabilities: ["accountant"],
            readRoles: ["viewer", "ar_clerk", "ap_clerk"],
          },
          {
            href: "/settings/bank-accounts",
            label: "Bank accounts",
            labelKey: "bank_accounts",
            icon: Banknote,
            capabilities: ["accountant"],
            readRoles: ["viewer"],
          },
        ],
      },
      {
        label: "Master data",
        labelKey: "master_data",
        items: [
          {
            href: "/settings/customers",
            label: "Customers",
            labelKey: "customers",
            icon: UsersRound,
            capabilities: ["ar_clerk"],
            readRoles: [...READ_DESK, "sales_rep"],
          },
          {
            href: "/settings/suppliers",
            label: "Vendors",
            labelKey: "suppliers",
            icon: Truck,
            keywords: ["vendor"],
            capabilities: ["ap_clerk"],
            readRoles: [...READ_DESK, "buyer"],
          },
          {
            href: "/settings/products",
            label: "Products",
            labelKey: "products",
            icon: Package,
            keywords: ["item", "sku"],
            capabilities: ["admin"],
            readRoles: [...READ_DESK, "warehouse", "buyer", "sales_rep", "ar_clerk", "ap_clerk"],
          },
          {
            href: "/settings/price-lists",
            label: "Price lists",
            labelKey: "price_lists",
            icon: Tags,
            capabilities: ["ar_clerk"],
            readRoles: [...READ_DESK, "sales_rep"],
          },
          {
            href: "/settings/sequences",
            label: "Sequences",
            labelKey: "sequences",
            icon: ListOrdered,
            keywords: ["numbering"],
            capabilities: ["admin"],
            readRoles: ["viewer"],
          },
        ],
      },
      {
        label: "Access",
        labelKey: "access",
        items: [
          {
            href: "/settings/users",
            label: "Users",
            labelKey: "users",
            icon: Users,
            capabilities: ["admin"],
          },
          {
            href: "/settings/approval-rules",
            label: "Approval rules",
            labelKey: "approval_rules",
            icon: ShieldCheck,
            capabilities: ["admin"],
          },
          {
            href: "/settings/audit",
            label: "Audit log",
            labelKey: "audit_log",
            icon: ScrollText,
            capabilities: ["admin"],
            readRoles: ["viewer", "accountant"],
          },
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

export type Crumb = { href?: string; label: string; labelKey?: string };

/**
 * Breadcrumb trail for a pathname: module → section → record.
 * Unknown trailing segments (record ids, `new`) become a final non-link crumb.
 * `labelKey` resolves against `nav` (same as the sidebar); `label` is fallback.
 */
export function buildBreadcrumbs(pathname: string): Crumb[] {
  const path = stripLocale(pathname);
  const module = findModule(path);
  if (!module) return [];

  const crumbs: Crumb[] = [
    {
      href: module.href,
      label: module.label,
      labelKey: module.labelKey ?? module.key,
    },
  ];

  const leaf = findLeaf(path);
  if (leaf && leaf.href !== module.href) {
    crumbs.push({
      href: leaf.href,
      label: leaf.label,
      labelKey: leaf.labelKey,
    });
  }

  const base = leaf?.href ?? module.href;
  const rest = path.slice(base.length).split("/").filter(Boolean);
  if (rest.length > 0) {
    const last = rest[rest.length - 1];
    crumbs.push({ label: last === "new" ? "New" : decodeURIComponent(last) });
  }

  return crumbs;
}
