/**
 * Atmata — AI co-pilot suggestion engine (deterministic mock).
 *
 * In production, the backend returns the same `AiSuggestion[]` shape from
 * an LLM-driven recommendation service. Here we encode a handful of
 * deterministic rules over the seed data so the rail has something useful
 * to say on every doc.
 */

import type {
  AdoptionContext,
  AiSuggestion,
  AiSuggestionScope,
  DocType,
} from "@/types";
import {
  GOODS_RECEIPTS,
  PURCHASE_ORDERS,
  VENDOR_BILLS,
} from "@/mocks/seed/p2p";
import {
  CUSTOMER_INVOICES,
  DELIVERY_NOTES,
  QUOTES,
  SALES_ORDERS,
} from "@/mocks/seed/q2c";
import { RFQS } from "@/mocks/seed/rfq";
import { getAdoptableLines } from "./adoption";

export async function getAiSuggestions(
  scope: AiSuggestionScope,
): Promise<AiSuggestion[]> {
  if (scope.kind !== "doc") return [];
  const out: AiSuggestion[] = [];

  switch (scope.docType) {
    case "po": {
      const po = PURCHASE_ORDERS.find((p) => p.id === scope.docId);
      if (!po) break;
      const grns = GOODS_RECEIPTS.filter((g) => g.poId === po.id);
      const bills = VENDOR_BILLS.filter((b) => b.poId === po.id);
      const totalOrdered = po.lines.reduce((s, l) => s + l.qty, 0);
      const totalReceived = grns
        .flatMap((g) => g.lines)
        .reduce((s, l) => s + l.qtyReceived, 0);

      if (
        (po.state === "confirmed" || po.state === "posted") &&
        totalReceived < totalOrdered
      ) {
        out.push({
          id: `${po.id}_suggest_receive`,
          scope,
          severity: "advice",
          title: "Receive remaining lines",
          rationale: `${totalReceived} of ${totalOrdered} units received. Trigger a GRN to capture the rest.`,
          confidence: 0.86,
          dismissable: true,
          primaryAction: await receiveAction(po.id, scope.docType),
        });
      }
      if (po.state === "posted" && bills.length === 0) {
        out.push({
          id: `${po.id}_suggest_bill`,
          scope,
          severity: "advice",
          title: "Bill from PO + GRN",
          rationale: "PO is posted but no vendor bill exists yet. Generate one now to keep AP current.",
          confidence: 0.78,
          dismissable: true,
          primaryAction: await billAction(po.id),
        });
      }
      break;
    }
    case "grn": {
      const grn = GOODS_RECEIPTS.find((g) => g.id === scope.docId);
      if (!grn) break;
      const bills = VENDOR_BILLS.filter((b) => b.grnId === grn.id);
      if (grn.state === "posted" && bills.length === 0) {
        out.push({
          id: `${grn.id}_suggest_bill`,
          scope,
          severity: "advice",
          title: "Create vendor bill from this GRN",
          rationale: "Stock has been received but the vendor invoice hasn't been entered yet.",
          confidence: 0.82,
          dismissable: true,
          primaryAction: await billFromGrnAction(grn.poId, grn.id),
        });
      }
      break;
    }
    case "vendor_bill": {
      const bill = VENDOR_BILLS.find((b) => b.id === scope.docId);
      if (!bill) break;
      if (bill.state === "posted" && bill.paid < bill.total) {
        out.push({
          id: `${bill.id}_suggest_pay`,
          scope,
          severity: "advice",
          title: "Pay outstanding balance",
          rationale: `Balance ${(bill.total - bill.paid).toFixed(3)} ${bill.currency} is outstanding.`,
          confidence: 0.88,
          dismissable: true,
          primaryAction: await payBillAction(bill.id, scope.docType),
        });
      }
      if (bill.threeWayMatch === "discrepancy") {
        out.push({
          id: `${bill.id}_warn_match`,
          scope,
          severity: "warning",
          title: "3-way match discrepancy",
          rationale: bill.discrepancyReason ?? "Bill qty or price does not match PO/GRN within tolerance.",
          confidence: 0.92,
          dismissable: false,
        });
      }
      const sameInvNumber = VENDOR_BILLS.filter(
        (b) =>
          b.id !== bill.id &&
          b.supplierId === bill.supplierId &&
          b.invoiceNumber === bill.invoiceNumber,
      );
      if (sameInvNumber.length) {
        out.push({
          id: `${bill.id}_warn_duplicate`,
          scope,
          severity: "critical",
          title: "Duplicate vendor invoice number",
          rationale: `Invoice ${bill.invoiceNumber} from this supplier was already used on ${sameInvNumber[0].number}.`,
          confidence: 0.99,
          dismissable: false,
        });
      }
      break;
    }
    case "rfq": {
      const rfq = RFQS.find((r) => r.id === scope.docId);
      if (!rfq) break;
      if (rfq.state === "quotes_received" && !rfq.award) {
        const sorted = rfq.quotes.slice().sort((a, b) => a.total - b.total);
        out.push({
          id: `${rfq.id}_suggest_award`,
          scope,
          severity: "advice",
          title: "Award to lowest bid",
          rationale: `Lowest total ${sorted[0]?.total.toFixed(3)} ${sorted[0]?.currency}. Lead-time check passed for this vendor.`,
          confidence: 0.74,
          dismissable: true,
        });
      }
      if (rfq.state === "awarded" && rfq.award && !rfq.award.poId) {
        out.push({
          id: `${rfq.id}_suggest_po`,
          scope,
          severity: "advice",
          title: "Create PO from awarded quote",
          rationale: "RFQ is awarded but no PO has been issued yet.",
          confidence: 0.9,
          dismissable: true,
        });
      }
      break;
    }
    case "quote": {
      const q = QUOTES.find((x) => x.id === scope.docId);
      if (!q) break;
      if (q.state === "accepted") {
        out.push({
          id: `${q.id}_suggest_so`,
          scope,
          severity: "advice",
          title: "Convert to sales order",
          rationale: "Customer accepted; create the SO to reserve stock.",
          confidence: 0.91,
          dismissable: true,
        });
      }
      if (q.state === "expired") {
        out.push({
          id: `${q.id}_warn_expired`,
          scope,
          severity: "warning",
          title: "Quote expired",
          rationale: `Valid until ${q.validUntil}. Re-issue if the customer is still interested.`,
          confidence: 0.95,
          dismissable: false,
        });
      }
      break;
    }
    case "so": {
      const so = SALES_ORDERS.find((s) => s.id === scope.docId);
      if (!so) break;
      const dns = DELIVERY_NOTES.filter((d) => d.soId === so.id);
      const invs = CUSTOMER_INVOICES.filter((i) => i.soId === so.id);
      const totalQty = so.lines.reduce((s, l) => s + l.qty, 0);
      const delivered = dns.flatMap((d) => d.lines).reduce((s, l) => s + l.qtyDelivered, 0);
      if (so.blockedReason) {
        out.push({
          id: `${so.id}_warn_credit`,
          scope,
          severity: "critical",
          title: "Order blocked",
          rationale: so.blockedReason,
          confidence: 0.99,
          dismissable: false,
        });
      } else if (so.state === "confirmed" && delivered < totalQty) {
        out.push({
          id: `${so.id}_suggest_deliver`,
          scope,
          severity: "advice",
          title: "Plan delivery",
          rationale: `${delivered} of ${totalQty} units delivered.`,
          confidence: 0.83,
          dismissable: true,
        });
      }
      if (so.state === "posted" && invs.length === 0) {
        out.push({
          id: `${so.id}_suggest_invoice`,
          scope,
          severity: "advice",
          title: "Invoice the customer",
          rationale: "SO is posted but no customer invoice exists yet.",
          confidence: 0.85,
          dismissable: true,
        });
      }
      break;
    }
    case "dn": {
      const dn = DELIVERY_NOTES.find((d) => d.id === scope.docId);
      if (!dn) break;
      const invs = CUSTOMER_INVOICES.filter((i) => i.dnId === dn.id);
      if (dn.state === "posted" && invs.length === 0) {
        out.push({
          id: `${dn.id}_suggest_invoice`,
          scope,
          severity: "advice",
          title: "Invoice this delivery",
          rationale: "Delivery posted; the customer has not been billed yet.",
          confidence: 0.84,
          dismissable: true,
        });
      }
      break;
    }
    case "customer_invoice": {
      const inv = CUSTOMER_INVOICES.find((x) => x.id === scope.docId);
      if (!inv) break;
      if (inv.state === "posted" && inv.paid < inv.total) {
        out.push({
          id: `${inv.id}_suggest_receipt`,
          scope,
          severity: "advice",
          title: "Record customer receipt",
          rationale: `Balance ${(inv.total - inv.paid).toFixed(3)} ${inv.currency} is outstanding.`,
          confidence: 0.81,
          dismissable: true,
        });
      }
      break;
    }
  }

  // Always end with a small "state explainer" card so the rail is never empty.
  out.push(buildStateCard(scope));
  return out;
}

/* ------------------------------------------------------------------ *
 *  Action builders — preload AdoptionContext for one-tap "Do it".
 * ------------------------------------------------------------------ */

async function receiveAction(poId: string, _docType: DocType) {
  const parent = await getAdoptableLines("po", poId);
  if (!parent) return undefined;
  const payload: AdoptionContext = {
    targetType: "grn",
    createdAt: new Date().toISOString(),
    parents: [parent],
  };
  return { label: "Receive", payload };
}

async function billAction(poId: string) {
  const parent = await getAdoptableLines("po", poId);
  if (!parent) return undefined;
  const payload: AdoptionContext = {
    targetType: "vendor_bill",
    createdAt: new Date().toISOString(),
    parents: [parent],
  };
  return { label: "Create bill", payload };
}

async function billFromGrnAction(_poId: string, grnId: string) {
  const parent = await getAdoptableLines("grn", grnId);
  if (!parent) return undefined;
  const payload: AdoptionContext = {
    targetType: "vendor_bill",
    createdAt: new Date().toISOString(),
    parents: [parent],
  };
  return { label: "Create bill", payload };
}

async function payBillAction(billId: string, _docType: DocType) {
  const parent = await getAdoptableLines("vendor_bill", billId);
  if (!parent) return undefined;
  const payload: AdoptionContext = {
    targetType: "vendor_payment",
    createdAt: new Date().toISOString(),
    parents: [parent],
  };
  return { label: "Pay", payload };
}

function buildStateCard(scope: AiSuggestionScope): AiSuggestion {
  if (scope.kind !== "doc") {
    return {
      id: "state_noop",
      scope,
      severity: "info",
      title: "Co-pilot active",
      rationale: "I'll surface anomalies and next actions as you work.",
      confidence: 1,
      dismissable: false,
    };
  }
  return {
    id: `${scope.docId}_state_explain`,
    scope,
    severity: "info",
    title: "How this doc moves",
    rationale: stateNarrative(scope.docType),
    confidence: 1,
    dismissable: true,
  };
}

function stateNarrative(t: DocType): string {
  switch (t) {
    case "pr": return "Submit → approve → adopt to RFQ (for tenders) or directly to PO.";
    case "rfq": return "Send → record quotes → award → PO created from the awarded quote.";
    case "po": return "Submit → approve → post. Then receive (GRN), bill, and pay.";
    case "grn": return "Post on receipt. Generates stock moves and feeds 3-way match.";
    case "vendor_bill": return "Match against PO + GRN. Post when within tolerance, otherwise route to approver.";
    case "vendor_payment": return "Allocate to bills, post, and the AP balance closes.";
    case "vendor_return": return "Post to reverse stock moves; a Debit Note is generated.";
    case "quote": return "Send → customer accepts → adopt to SO.";
    case "so": return "Confirm (credit check) → deliver → invoice → receipt.";
    case "dn": return "Post on ship-out. Generates outbound stock moves.";
    case "customer_invoice": return "Post → record receipts until paid.";
    case "customer_receipt": return "Allocate to invoices; AR balance closes.";
    case "customer_return": return "Post to reverse stock moves; a Credit Note is generated.";
    default: return "Generic state machine: draft → pending → confirmed → posted.";
  }
}

/* ------------------------------------------------------------------ *
 *  Queued actions (Auto mode) — toast-only persistence.
 * ------------------------------------------------------------------ */

const QUEUED_KEY = "atmata.ai.queued";

export type QueuedActionRecord = {
  id: string;
  suggestionId: string;
  scope: AiSuggestionScope;
  label: string;
  queuedAt: string;
  proposedByBot: true;
};

export function recordQueuedAction(rec: Omit<QueuedActionRecord, "id" | "queuedAt">): QueuedActionRecord {
  const entry: QueuedActionRecord = {
    ...rec,
    id: `q_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    queuedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      const prev: QueuedActionRecord[] = JSON.parse(
        window.sessionStorage.getItem(QUEUED_KEY) ?? "[]",
      );
      window.sessionStorage.setItem(QUEUED_KEY, JSON.stringify([entry, ...prev]));
      // eslint-disable-next-line no-console
      console.info("atmata:event", "ai.action.queued", entry);
    } catch {
      /* ignore */
    }
  }
  return entry;
}

export function listQueuedActions(): QueuedActionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(QUEUED_KEY) ?? "[]");
  } catch {
    return [];
  }
}
