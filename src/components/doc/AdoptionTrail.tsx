"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AdoptionTreeNode, DocType } from "@/types";

/**
 * AdoptionTrail — horizontal pipeline showing a doc's full ancestry
 * (upstream) and descendants (downstream). Rendered as a tab on every
 * doc detail page.
 *
 * Layout:
 *   [ancestors] → [you] → [descendants]
 *
 * Tree branches stack vertically inside each column.
 */

export type AdoptionTrailProps = {
  locale: string;
  /** Tree rooted at "you", walking upward. */
  ancestry: AdoptionTreeNode | null;
  /** Tree rooted at "you", walking downward. */
  descendants: AdoptionTreeNode | null;
};

export function AdoptionTrail({ locale, ancestry, descendants }: AdoptionTrailProps) {
  const t = useTranslations("adoption");
  if (!ancestry && !descendants) {
    return (
      <div className="rounded-md border border-dashed border-input bg-muted/50 p-6 text-center text-sm text-muted-foreground">
        {t("trailEmpty")}
      </div>
    );
  }

  // Flatten upstream nodes into columns (level-by-level).
  const ancestorCols = ancestry ? collectLevels(ancestry, "up") : [];
  const root = ancestry ?? descendants;
  const descCols = descendants ? collectLevels(descendants, "down") : [];

  // Drop the root from one side so it doesn't double up.
  if (ancestorCols.length && descCols.length) descCols.shift();

  const columns = [...ancestorCols.slice().reverse(), ...descCols];
  if (!ancestorCols.length && descendants) columns.unshift([root!]);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-stretch gap-2">
        {columns.map((col, ci) => (
          <React.Fragment key={ci}>
            <div className="flex min-w-[180px] flex-col gap-2">
              {col.map((node) => (
                <TrailCard key={`${node.docType}-${node.docId}`} node={node} locale={locale} />
              ))}
            </div>
            {ci < columns.length - 1 ? (
              <div className="flex items-center text-muted-foreground">→</div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function TrailCard({ node, locale }: { node: AdoptionTreeNode; locale: string }) {
  const href = hrefFor(node.docType, node.docId, locale);
  const content = (
    <div className="rounded-lg border border-border bg-card p-3 hover:border-primary/30">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {labelFor(node.docType)}
      </div>
      <div className="mt-0.5 font-mono text-xs text-foreground">{node.docNumber}</div>
      <div className="mt-1">
        <StateBadge state={node.state} />
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

function StateBadge({ state }: { state: string }) {
  const tone =
    state === "posted" || state === "awarded" || state === "closed"
      ? "bg-status-success-muted text-status-success-foreground"
      : state === "draft"
        ? "bg-muted text-foreground"
        : state === "cancelled"
          ? "bg-status-danger-muted text-destructive"
          : "bg-status-pending-muted text-status-pending-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {state}
    </span>
  );
}

/* ------------------------------------------------------------------ */

function collectLevels(
  root: AdoptionTreeNode,
  direction: "up" | "down",
): AdoptionTreeNode[][] {
  const levels: AdoptionTreeNode[][] = [[root]];
  let frontier = [root];
  while (frontier.length) {
    const next: AdoptionTreeNode[] = [];
    for (const n of frontier) next.push(...n.children);
    if (!next.length) break;
    levels.push(next);
    frontier = next;
    // Sanity cap.
    if (levels.length > 6) break;
  }
  // direction is purely informational; both up and down produce ordered
  // children-from-root levels — the renderer reverses ancestry columns
  // so the doc displays leftmost.
  void direction;
  return levels;
}

function hrefFor(t: DocType, id: string, locale: string): string | null {
  switch (t) {
    case "pr": return `/${locale}/purchasing/purchase-requisitions/${id}`;
    case "rfq": return `/${locale}/purchasing/rfqs/${id}`;
    case "po": return `/${locale}/purchasing/purchase-orders/${id}`;
    case "grn": return `/${locale}/purchasing/goods-receipts/${id}`;
    case "vendor_bill": return `/${locale}/purchasing/bills/${id}`;
    case "vendor_payment": return `/${locale}/purchasing/payments/${id}`;
    case "vendor_return": return `/${locale}/purchasing/vendor-returns/${id}`;
    case "debit_note": return `/${locale}/purchasing/debit-notes/${id}`;
    case "quote": return `/${locale}/sales/quotes/${id}`;
    case "so": return `/${locale}/sales/orders/${id}`;
    case "dn": return `/${locale}/sales/deliveries/${id}`;
    case "customer_invoice": return `/${locale}/sales/invoices/${id}`;
    case "customer_receipt": return `/${locale}/sales/receipts/${id}`;
    case "customer_return": return `/${locale}/sales/returns/${id}`;
    case "credit_note": return `/${locale}/sales/credit-notes/${id}`;
    default: return null;
  }
}

function labelFor(t: DocType): string {
  switch (t) {
    case "pr": return "PR";
    case "rfq": return "RFQ";
    case "po": return "PO";
    case "grn": return "GRN";
    case "vendor_bill": return "Bill";
    case "vendor_payment": return "Payment";
    case "vendor_return": return "V. Return";
    case "debit_note": return "Debit";
    case "quote": return "Quote";
    case "so": return "SO";
    case "dn": return "DN";
    case "customer_invoice": return "Invoice";
    case "customer_receipt": return "Receipt";
    case "customer_return": return "C. Return";
    case "credit_note": return "Credit";
    default: return t;
  }
}
