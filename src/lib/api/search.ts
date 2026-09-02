import { allNavLeaves } from "@/config/navigation";
import { canAnyOperation, type OperationKey } from "@/lib/roles";
import { leafVisible } from "@/lib/roles/nav-filter";
import type { Role } from "@/types";
import type { SearchResult } from "@/types/search";

type ActionDef = SearchResult & {
  /** Gated by canAnyOperation when set. */
  operation?: OperationKey;
  /** Gated by leafVisible on the matching nav leaf (close / recon). */
  navHref?: string;
  /** Visible to every signed-in role (inbox, dashboard). */
  alwaysVisible?: boolean;
};

const ACTIONS: ActionDef[] = [
  {
    id: "act_new_pr",
    kind: "action",
    label: "Create Purchase Requisition",
    subtitle: "Start the P2P chain",
    href: (l) => `/${l}/purchasing/purchase-requisitions/new`,
    keywords: ["pr", "new", "requisition", "buy", "request"],
    operation: "create_purchase_requisition",
  },
  {
    id: "act_new_rfq",
    kind: "action",
    label: "Create RFQ",
    subtitle: "Request quotes from vendors",
    href: (l) => `/${l}/purchasing/rfqs/new`,
    keywords: ["rfq", "tender", "quote", "request for quotation"],
    operation: "create_rfq",
  },
  {
    id: "act_new_po",
    kind: "action",
    label: "Create Purchase Order",
    href: (l) => `/${l}/purchasing/purchase-orders/new`,
    keywords: ["po", "new", "order"],
    operation: "create_purchase_order",
  },
  {
    id: "act_new_grn",
    kind: "action",
    label: "Create Goods Receipt",
    href: (l) => `/${l}/purchasing/goods-receipts/new`,
    keywords: ["grn", "receive", "receipt"],
    operation: "create_goods_receipt",
  },
  {
    id: "act_new_bill",
    kind: "action",
    label: "Create Vendor Bill",
    href: (l) => `/${l}/purchasing/bills/new`,
    keywords: ["bill", "ap", "invoice", "vendor"],
    operation: "create_vendor_bill",
  },
  {
    id: "act_new_payment",
    kind: "action",
    label: "Create Vendor Payment",
    href: (l) => `/${l}/purchasing/payments/new`,
    keywords: ["pay", "payment", "vendor"],
    operation: "create_vendor_payment",
  },
  {
    id: "act_new_quote",
    kind: "action",
    label: "Create Sales Quote",
    href: (l) => `/${l}/sales/quotes/new`,
    keywords: ["quote", "qt", "sales"],
    operation: "create_quote",
  },
  {
    id: "act_new_so",
    kind: "action",
    label: "Create Sales Order",
    href: (l) => `/${l}/sales/orders/new`,
    keywords: ["so", "order", "sales"],
    operation: "create_sales_order",
  },
  {
    id: "act_new_dn",
    kind: "action",
    label: "Create Delivery Note",
    href: (l) => `/${l}/sales/deliveries/new`,
    keywords: ["dn", "delivery", "deliver", "ship"],
    operation: "create_delivery_note",
  },
  {
    id: "act_new_invoice",
    kind: "action",
    label: "Create Customer Invoice",
    href: (l) => `/${l}/sales/invoices/new`,
    keywords: ["invoice", "inv", "ar", "customer"],
    operation: "create_customer_invoice",
  },
  {
    id: "act_new_receipt",
    kind: "action",
    label: "Create Customer Receipt",
    href: (l) => `/${l}/sales/receipts/new`,
    keywords: ["receipt", "rcp", "ar"],
    operation: "create_customer_receipt",
  },
  {
    id: "act_new_je",
    kind: "action",
    label: "Create Journal Entry",
    href: (l) => `/${l}/accounting/journal-entries/new`,
    keywords: ["je", "journal", "manual"],
    operation: "create_journal_entry",
  },
  {
    id: "act_inbox",
    kind: "action",
    label: "Open inbox",
    href: (l) => `/${l}/inbox`,
    keywords: ["alerts", "notifications", "tasks"],
    alwaysVisible: true,
  },
  {
    id: "act_dashboard",
    kind: "action",
    label: "Open dashboard",
    href: (l) => `/${l}/dashboard`,
    keywords: ["home", "kpi", "cfo"],
    alwaysVisible: true,
  },
  {
    id: "act_close",
    kind: "action",
    label: "Open month-end close",
    href: (l) => `/${l}/accounting/close`,
    keywords: ["close", "checklist", "month end"],
    navHref: "/accounting/close",
  },
  {
    id: "act_recon",
    kind: "action",
    label: "Open reconciliation",
    href: (l) => `/${l}/accounting/reconciliation`,
    keywords: ["bank", "recon", "match"],
    navHref: "/accounting/reconciliation",
  },
];

function actionVisible(action: ActionDef, roles: readonly Role[]): boolean {
  if (action.alwaysVisible) return true;
  if (action.operation) return canAnyOperation(roles, action.operation);
  if (action.navHref) {
    const leaf = allNavLeaves.find((l) => l.href === action.navHref);
    return leaf ? leafVisible(leaf, roles) : false;
  }
  return true;
}

function toSearchResult(action: ActionDef): SearchResult {
  const { operation: _op, navHref: _nav, alwaysVisible: _vis, ...result } = action;
  return result;
}

/** Client-safe static action/settings index. Database results come from /api/search. */
export async function buildSearchIndex(
  roles: readonly Role[],
): Promise<SearchResult[]> {
  const out: SearchResult[] = ACTIONS.filter((a) => actionVisible(a, roles)).map(
    toSearchResult,
  );

  for (const leaf of allNavLeaves) {
    if (leaf.module.key !== "settings") continue;
    if (leaf.href === "/settings") continue;
    if (!leafVisible(leaf, roles)) continue;

    const slug = leaf.href.replace(/^\/settings\//, "");
    out.push({
      id: `set_${slug}`,
      kind: "settings",
      label: leaf.label,
      subtitle: `Settings · /${slug}`,
      href: (l) => `/${l}${leaf.href}`,
      keywords: ["settings", ...(leaf.keywords ?? [])],
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
