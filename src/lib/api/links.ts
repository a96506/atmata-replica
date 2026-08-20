import {
  listGoodsReceipts,
  listPurchaseOrders,
  listPurchaseRequisitions,
  listVendorBills,
  listVendorPayments,
} from "./p2p";
import {
  listCustomerInvoices,
  listCustomerReceipts,
  listDeliveryNotes,
  listQuotes,
  listSalesOrders,
} from "./q2c";
import {
  listInternalTransfers,
  listStockAdjustments,
  listStockMoves,
} from "./inventory-tx";
import { listJournalEntries } from "./gl";
import { listRfqs } from "./rfq";
import {
  listCreditNotes,
  listCustomerReturns,
  listDebitNotes,
  listVendorReturns,
} from "./returns";
import type { DocType } from "@/types";

export type RelatedLink = {
  label: string;
  href: string;
  badge?: string | null;
};

export type RelatedDocsGroup = {
  groupLabel: string;
  links: RelatedLink[];
  count?: number;
};

const localePath = (locale: string, path: string) =>
  `/${locale}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * Compute the related-docs panel for a given business document.
 * The locale prefix is needed for proper next-intl routing.
 */
export async function relatedDocsFor(
  docType: DocType,
  docId: string,
  locale: string,
): Promise<RelatedDocsGroup[]> {
  const [
    PURCHASE_REQUISITIONS,
    PURCHASE_ORDERS,
    GOODS_RECEIPTS,
    VENDOR_BILLS,
    VENDOR_PAYMENTS,
    QUOTES,
    SALES_ORDERS,
    DELIVERY_NOTES,
    CUSTOMER_INVOICES,
    CUSTOMER_RECEIPTS,
    INTERNAL_TRANSFERS,
    STOCK_ADJUSTMENTS,
    STOCK_MOVES,
    JOURNAL_ENTRIES,
    RFQS,
    VENDOR_RETURNS,
    DEBIT_NOTES,
    CUSTOMER_RETURNS,
    CREDIT_NOTES,
  ] = await Promise.all([
    listPurchaseRequisitions(),
    listPurchaseOrders(),
    listGoodsReceipts(),
    listVendorBills(),
    listVendorPayments(),
    listQuotes(),
    listSalesOrders(),
    listDeliveryNotes(),
    listCustomerInvoices(),
    listCustomerReceipts(),
    listInternalTransfers(),
    listStockAdjustments(),
    listStockMoves(),
    listJournalEntries(),
    listRfqs(),
    listVendorReturns(),
    listDebitNotes(),
    listCustomerReturns(),
    listCreditNotes(),
  ]);
  const groups: RelatedDocsGroup[] = [];
  const p = (path: string) => localePath(locale, path);

  switch (docType) {
    case "po": {
      const po = PURCHASE_ORDERS.find((x) => x.id === docId);
      if (!po) break;
      if (po.prId) {
        const pr = PURCHASE_REQUISITIONS.find((x) => x.id === po.prId);
        if (pr) {
          groups.push({
            groupLabel: "From PR",
            links: [{ label: pr.number, href: p(`/purchasing/purchase-orders/${po.id}#pr`) }],
          });
        }
      }
      const grns = GOODS_RECEIPTS.filter((g) => g.poId === po.id);
      groups.push({
        groupLabel: "Goods receipts",
        count: grns.length,
        links: grns.map((g) => ({
          label: g.number,
          href: p(`/purchasing/goods-receipts/${g.id}`),
          badge: g.state,
        })),
      });
      const bills = VENDOR_BILLS.filter((b) => b.poId === po.id);
      groups.push({
        groupLabel: "Vendor bills",
        count: bills.length,
        links: bills.map((b) => ({
          label: b.number,
          href: p(`/purchasing/bills/${b.id}`),
          badge: b.threeWayMatch,
        })),
      });
      const payments = VENDOR_PAYMENTS.filter((vp) =>
        vp.allocations.some((a) => bills.some((b) => b.id === a.billId)),
      );
      groups.push({
        groupLabel: "Vendor payments",
        count: payments.length,
        links: payments.map((vp) => ({
          label: vp.number,
          href: p(`/purchasing/payments/${vp.id}`),
          badge: vp.state,
        })),
      });
      break;
    }

    case "grn": {
      const grn = GOODS_RECEIPTS.find((x) => x.id === docId);
      if (!grn) break;
      groups.push({
        groupLabel: "From PO",
        links: [{ label: grn.poId, href: p(`/purchasing/purchase-orders/${grn.poId}`) }],
      });
      const bills = VENDOR_BILLS.filter((b) => b.grnId === grn.id);
      groups.push({
        groupLabel: "Vendor bills",
        count: bills.length,
        links: bills.map((b) => ({
          label: b.number,
          href: p(`/purchasing/bills/${b.id}`),
          badge: b.threeWayMatch,
        })),
      });
      const vrets = VENDOR_RETURNS.filter((v) => v.grnId === grn.id);
      if (vrets.length) {
        groups.push({
          groupLabel: "Vendor returns",
          count: vrets.length,
          links: vrets.map((v) => ({
            label: v.number,
            href: p(`/purchasing/vendor-returns/${v.id}`),
            badge: v.state,
          })),
        });
      }
      const moves = STOCK_MOVES.filter(
        (m) => m.sourceType === "grn" && m.sourceId === grn.id,
      );
      groups.push({
        groupLabel: "Stock moves",
        count: moves.length,
        links: moves.map((m) => ({
          label: m.number,
          href: p(`/inventory/stock-moves#${m.id}`),
          badge: `${m.direction === "in" ? "+" : "-"}${m.qty}`,
        })),
      });
      break;
    }

    case "vendor_bill": {
      const bill = VENDOR_BILLS.find((x) => x.id === docId);
      if (!bill) break;
      if (bill.poId)
        groups.push({
          groupLabel: "From PO",
          links: [{ label: bill.poId, href: p(`/purchasing/purchase-orders/${bill.poId}`) }],
        });
      if (bill.grnId)
        groups.push({
          groupLabel: "From GRN",
          links: [{ label: bill.grnId, href: p(`/purchasing/goods-receipts/${bill.grnId}`) }],
        });
      const payments = VENDOR_PAYMENTS.filter((vp) =>
        vp.allocations.some((a) => a.billId === bill.id),
      );
      groups.push({
        groupLabel: "Vendor payments",
        count: payments.length,
        links: payments.map((vp) => ({
          label: vp.number,
          href: p(`/purchasing/payments/${vp.id}`),
          badge: vp.state,
        })),
      });
      break;
    }

    case "vendor_payment": {
      const vpay = VENDOR_PAYMENTS.find((x) => x.id === docId);
      if (!vpay) break;
      groups.push({
        groupLabel: "Bills",
        count: vpay.allocations.length,
        links: vpay.allocations.map((a) => ({
          label: a.billId,
          href: p(`/purchasing/bills/${a.billId}`),
          badge: a.amount.toFixed(3),
        })),
      });
      break;
    }

    case "quote": {
      const q = QUOTES.find((x) => x.id === docId);
      if (!q) break;
      const sos = SALES_ORDERS.filter((s) => s.quoteId === q.id);
      groups.push({
        groupLabel: "Sales orders",
        count: sos.length,
        links: sos.map((s) => ({
          label: s.number,
          href: p(`/sales/orders/${s.id}`),
          badge: s.state,
        })),
      });
      break;
    }

    case "so": {
      const so = SALES_ORDERS.find((x) => x.id === docId);
      if (!so) break;
      if (so.quoteId)
        groups.push({
          groupLabel: "From quote",
          links: [{ label: so.quoteId, href: p(`/sales/quotes/${so.quoteId}`) }],
        });
      const dns = DELIVERY_NOTES.filter((d) => d.soId === so.id);
      groups.push({
        groupLabel: "Delivery notes",
        count: dns.length,
        links: dns.map((d) => ({
          label: d.number,
          href: p(`/sales/deliveries/${d.id}`),
          badge: d.state,
        })),
      });
      const invs = CUSTOMER_INVOICES.filter((i) => i.soId === so.id);
      groups.push({
        groupLabel: "Customer invoices",
        count: invs.length,
        links: invs.map((i) => ({
          label: i.number,
          href: p(`/sales/invoices/${i.id}`),
          badge: i.state,
        })),
      });
      break;
    }

    case "dn": {
      const dn = DELIVERY_NOTES.find((x) => x.id === docId);
      if (!dn) break;
      groups.push({
        groupLabel: "From SO",
        links: [{ label: dn.soId, href: p(`/sales/orders/${dn.soId}`) }],
      });
      const invs = CUSTOMER_INVOICES.filter((i) => i.dnId === dn.id);
      groups.push({
        groupLabel: "Customer invoices",
        count: invs.length,
        links: invs.map((i) => ({
          label: i.number,
          href: p(`/sales/invoices/${i.id}`),
          badge: i.state,
        })),
      });
      const crets = CUSTOMER_RETURNS.filter((c) => c.dnId === dn.id);
      if (crets.length) {
        groups.push({
          groupLabel: "Customer returns",
          count: crets.length,
          links: crets.map((c) => ({
            label: c.number,
            href: p(`/sales/returns/${c.id}`),
            badge: c.state,
          })),
        });
      }
      const moves = STOCK_MOVES.filter(
        (m) => m.sourceType === "delivery_note" && m.sourceId === dn.id,
      );
      groups.push({
        groupLabel: "Stock moves",
        count: moves.length,
        links: moves.map((m) => ({
          label: m.number,
          href: p(`/inventory/stock-moves#${m.id}`),
          badge: `${m.direction === "in" ? "+" : "-"}${m.qty}`,
        })),
      });
      break;
    }

    case "customer_invoice": {
      const inv = CUSTOMER_INVOICES.find((x) => x.id === docId);
      if (!inv) break;
      if (inv.soId)
        groups.push({
          groupLabel: "From SO",
          links: [{ label: inv.soId, href: p(`/sales/orders/${inv.soId}`) }],
        });
      if (inv.dnId)
        groups.push({
          groupLabel: "From DN",
          links: [{ label: inv.dnId, href: p(`/sales/deliveries/${inv.dnId}`) }],
        });
      const rcps = CUSTOMER_RECEIPTS.filter((r) =>
        r.allocations.some((a) => a.invoiceId === inv.id),
      );
      groups.push({
        groupLabel: "Customer receipts",
        count: rcps.length,
        links: rcps.map((r) => ({
          label: r.number,
          href: p(`/sales/receipts/${r.id}`),
          badge: r.state,
        })),
      });
      break;
    }

    case "customer_receipt": {
      const rcp = CUSTOMER_RECEIPTS.find((x) => x.id === docId);
      if (!rcp) break;
      groups.push({
        groupLabel: "Invoices",
        count: rcp.allocations.length,
        links: rcp.allocations.map((a) => ({
          label: a.invoiceId,
          href: p(`/sales/invoices/${a.invoiceId}`),
          badge: a.amount.toFixed(3),
        })),
      });
      break;
    }

    case "internal_transfer": {
      const trx = INTERNAL_TRANSFERS.find((x) => x.id === docId);
      if (!trx) break;
      const moves = STOCK_MOVES.filter(
        (m) => m.sourceType === "internal_transfer" && m.sourceId === trx.id,
      );
      groups.push({
        groupLabel: "Stock moves",
        count: moves.length,
        links: moves.map((m) => ({
          label: m.number,
          href: p(`/inventory/stock-moves#${m.id}`),
          badge: `${m.direction === "in" ? "+" : "-"}${m.qty}`,
        })),
      });
      break;
    }

    case "stock_adjustment": {
      const adj = STOCK_ADJUSTMENTS.find((x) => x.id === docId);
      if (!adj) break;
      const moves = STOCK_MOVES.filter(
        (m) => m.sourceType === "stock_adjustment" && m.sourceId === adj.id,
      );
      groups.push({
        groupLabel: "Stock moves",
        count: moves.length,
        links: moves.map((m) => ({
          label: m.number,
          href: p(`/inventory/stock-moves#${m.id}`),
          badge: `${m.direction === "in" ? "+" : "-"}${m.qty}`,
        })),
      });
      break;
    }

    case "journal_entry": {
      const je = JOURNAL_ENTRIES.find((x) => x.id === docId);
      if (!je) break;
      const sourceHref =
        je.sourceType === "vendor_bill"
          ? `/purchasing/bills/${je.sourceId}`
          : je.sourceType === "vendor_payment"
            ? `/purchasing/payments/${je.sourceId}`
            : je.sourceType === "grn"
              ? `/purchasing/goods-receipts/${je.sourceId}`
              : je.sourceType === "customer_invoice"
                ? `/sales/invoices/${je.sourceId}`
                : je.sourceType === "customer_receipt"
                  ? `/sales/receipts/${je.sourceId}`
                  : je.sourceType === "dn"
                    ? `/sales/deliveries/${je.sourceId}`
                    : je.sourceType === "stock_adjustment"
                      ? `/inventory/adjustments/${je.sourceId}`
                      : null;
      if (sourceHref && je.sourceId)
        groups.push({
          groupLabel: "Source document",
          links: [{ label: je.sourceId, href: p(sourceHref), badge: je.sourceType }],
        });
      break;
    }

    case "rfq": {
      const rfq = RFQS.find((x) => x.id === docId);
      if (!rfq) break;
      if (rfq.prIds.length) {
        groups.push({
          groupLabel: "From PR",
          links: rfq.prIds.map((id) => ({
            label: id,
            href: p(`/purchasing/purchase-requisitions/${id}`),
          })),
        });
      }
      if (rfq.award?.poId) {
        groups.push({
          groupLabel: "PO (awarded)",
          links: [
            {
              label: rfq.award.poId,
              href: p(`/purchasing/purchase-orders/${rfq.award.poId}`),
              badge: "awarded",
            },
          ],
        });
      }
      break;
    }

    case "vendor_return": {
      const vr = VENDOR_RETURNS.find((x) => x.id === docId);
      if (!vr) break;
      groups.push({
        groupLabel: "From GRN",
        links: [{ label: vr.grnId, href: p(`/purchasing/goods-receipts/${vr.grnId}`) }],
      });
      const dnotes = DEBIT_NOTES.filter((d) => d.vendorReturnId === vr.id);
      if (dnotes.length) {
        groups.push({
          groupLabel: "Debit notes",
          count: dnotes.length,
          links: dnotes.map((d) => ({
            label: d.number,
            href: p(`/purchasing/debit-notes/${d.id}`),
            badge: d.state,
          })),
        });
      }
      break;
    }

    case "debit_note": {
      const dn = DEBIT_NOTES.find((x) => x.id === docId);
      if (!dn) break;
      groups.push({
        groupLabel: "From vendor return",
        links: [
          {
            label: dn.vendorReturnId,
            href: p(`/purchasing/vendor-returns/${dn.vendorReturnId}`),
          },
        ],
      });
      if (dn.billId) {
        groups.push({
          groupLabel: "Applied to bill",
          links: [{ label: dn.billId, href: p(`/purchasing/bills/${dn.billId}`) }],
        });
      }
      break;
    }

    case "customer_return": {
      const cr = CUSTOMER_RETURNS.find((x) => x.id === docId);
      if (!cr) break;
      groups.push({
        groupLabel: "From DN",
        links: [{ label: cr.dnId, href: p(`/sales/deliveries/${cr.dnId}`) }],
      });
      const cnotes = CREDIT_NOTES.filter((c) => c.customerReturnId === cr.id);
      if (cnotes.length) {
        groups.push({
          groupLabel: "Credit notes",
          count: cnotes.length,
          links: cnotes.map((c) => ({
            label: c.number,
            href: p(`/sales/credit-notes/${c.id}`),
            badge: c.state,
          })),
        });
      }
      break;
    }

    case "credit_note": {
      const cn = CREDIT_NOTES.find((x) => x.id === docId);
      if (!cn) break;
      groups.push({
        groupLabel: "From customer return",
        links: [
          {
            label: cn.customerReturnId,
            href: p(`/sales/returns/${cn.customerReturnId}`),
          },
        ],
      });
      if (cn.invoiceId) {
        groups.push({
          groupLabel: "Applied to invoice",
          links: [{ label: cn.invoiceId, href: p(`/sales/invoices/${cn.invoiceId}`) }],
        });
      }
      break;
    }

    case "pr": {
      const pr = PURCHASE_REQUISITIONS.find((x) => x.id === docId);
      if (!pr) break;
      const rfqs = RFQS.filter((r) => r.prIds.includes(pr.id));
      groups.push({
        groupLabel: "RFQs",
        count: rfqs.length,
        links: rfqs.map((r) => ({
          label: r.number,
          href: p(`/purchasing/rfqs/${r.id}`),
          badge: r.state,
        })),
      });
      const pos = PURCHASE_ORDERS.filter((po) => po.prId === pr.id);
      groups.push({
        groupLabel: "Purchase orders",
        count: pos.length,
        links: pos.map((po) => ({
          label: po.number,
          href: p(`/purchasing/purchase-orders/${po.id}`),
          badge: po.state,
        })),
      });
      break;
    }

    default:
      break;
  }

  // Every posted document has a JE — surface it.
  const je = JOURNAL_ENTRIES.find(
    (j) => j.sourceType === docType && j.sourceId === docId,
  );
  if (je) {
    groups.push({
      groupLabel: "Journal entry",
      links: [
        {
          label: je.number,
          href: p(`/accounting/journal-entries/${je.id}`),
          badge: je.state,
        },
      ],
    });
  }

  return groups;
}
