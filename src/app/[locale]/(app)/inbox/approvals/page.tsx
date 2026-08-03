import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { ApprovalActions } from "./approval-actions";
import {
  listPurchaseOrders,
  listVendorBills,
  listVendorPayments,
} from "@/lib/api/p2p";
import {
  listCustomerInvoices,
  listSalesOrders,
} from "@/lib/api/q2c";
import { listJournalEntries } from "@/lib/api/gl";
import { listStockAdjustments } from "@/lib/api/inventory-tx";
import { resolveApprovalChain } from "@/mocks/seed/approvals";
import { formatMoney } from "@/lib/money";
import type { DocType } from "@/types";

type PendingRow = {
  id: string;
  docType: DocType;
  number: string;
  party: string;
  date: string;
  total: number;
  currency: "KWD" | "SAR" | "AED" | "USD";
  detailHref: (locale: string) => string;
};

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [pos, bills, vpays, invs, sos, jes, adjs] = await Promise.all([
    listPurchaseOrders(),
    listVendorBills(),
    listVendorPayments(),
    listCustomerInvoices(),
    listSalesOrders(),
    listJournalEntries(),
    listStockAdjustments(),
  ]);

  const isPending = (s: string) => s === "pending" || s === "draft";

  const rows: PendingRow[] = [
    ...pos
      .filter((p) => p.state === "pending")
      .map((p) => ({
        id: p.id,
        docType: "po" as DocType,
        number: p.number,
        party: p.supplierId,
        date: p.date,
        total: p.total,
        currency: p.currency,
        detailHref: (l: string) => `/${l}/purchasing/purchase-orders/${p.id}`,
      })),
    ...bills
      .filter((b) => isPending(b.state))
      .map((b) => ({
        id: b.id,
        docType: "vendor_bill" as DocType,
        number: b.number,
        party: b.supplierId,
        date: b.date,
        total: b.total,
        currency: b.currency,
        detailHref: (l: string) => `/${l}/purchasing/bills/${b.id}`,
      })),
    ...vpays
      .filter((v) => v.state === "pending")
      .map((v) => ({
        id: v.id,
        docType: "vendor_payment" as DocType,
        number: v.number,
        party: v.supplierId,
        date: v.date,
        total: v.amount,
        currency: v.currency,
        detailHref: (l: string) => `/${l}/purchasing/payments/${v.id}`,
      })),
    ...sos
      .filter((s) => s.state === "pending")
      .map((s) => ({
        id: s.id,
        docType: "so" as DocType,
        number: s.number,
        party: s.customerId,
        date: s.date,
        total: s.total,
        currency: s.currency,
        detailHref: (l: string) => `/${l}/sales/orders/${s.id}`,
      })),
    ...invs
      .filter((i) => i.state === "pending")
      .map((i) => ({
        id: i.id,
        docType: "customer_invoice" as DocType,
        number: i.number,
        party: i.customerId,
        date: i.date,
        total: i.total,
        currency: i.currency,
        detailHref: (l: string) => `/${l}/sales/invoices/${i.id}`,
      })),
    ...adjs
      .filter((a) => a.state === "pending")
      .map((a) => ({
        id: a.id,
        docType: "stock_adjustment" as DocType,
        number: a.number,
        party: "—",
        date: a.date,
        total: 0,
        currency: "KWD" as const,
        detailHref: (l: string) => `/${l}/inventory/adjustments/${a.id}`,
      })),
    ...jes
      .filter((j) => j.state === "draft")
      .map((j) => ({
        id: j.id,
        docType: "journal_entry" as DocType,
        number: j.number,
        party: "—",
        date: j.date,
        total: j.lines.reduce((s, l) => s + l.debit, 0),
        currency: j.currency,
        detailHref: (l: string) => `/${l}/accounting/journal-entries/${j.id}`,
      })),
  ];

  return (
    <DocumentList
      title="Approvals inbox"
      subtitle="Pending documents matched to approval rules. Approver-role users see actions inline."
    >
      <DataTable
        columns={[
          { key: "doc", label: "Document" },
          { key: "party", label: "Party" },
          { key: "date", label: "Date" },
          { key: "total", label: "Amount", className: "text-right" },
          { key: "route", label: "Route" },
          { key: "state", label: "Status" },
          { key: "actions", label: "", className: "text-right" },
        ]}
        rows={rows.map((r) => {
          const chain = resolveApprovalChain(r.docType, r.total);
          return [
            <div key="d">
              <Link
                href={r.detailHref(locale)}
                className="font-medium text-primary hover:underline"
              >
                {r.number}
              </Link>
              <div className="text-xs text-muted-foreground">{r.docType}</div>
            </div>,
            r.party,
            r.date,
            <span key="t" className="tabular-nums">
              {formatMoney(r.total, r.currency)}
            </span>,
            <span key="r" className="text-xs text-muted-foreground">
              {chain.length === 0
                ? "auto-confirm"
                : chain.map((c) => c.approverName).join(" → ")}
            </span>,
            <StateBadge key="s" state="pending" />,
            <ApprovalActions
              key="a"
              docNumber={r.number}
              detailHref={r.detailHref(locale)}
            />,
          ];
        })}
        emptyMessage="Nothing waiting on approval right now."
      />
    </DocumentList>
  );
}
