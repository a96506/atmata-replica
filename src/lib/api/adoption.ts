/**
 * Atmata — Adoption API.
 *
 * Reads parent docs from mock seeds, computes per-line adoptable qty
 * (parent qty minus already-adopted child qty), walks the doc graph
 * to build ancestry / descendant trees, and provides a toast-only
 * `recordAdoptions` for the demo (backend will wire a real persistence).
 */

import type {
  AdoptionContext,
  AdoptionEdge,
  AdoptionParent,
  AdoptionParentLine,
  AdoptionTreeNode,
  DocType,
} from "@/types";
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
import { RFQS } from "@/mocks/seed/rfq";
import {
  CUSTOMER_RETURNS,
  VENDOR_RETURNS,
  DEBIT_NOTES,
  CREDIT_NOTES,
} from "@/mocks/seed/returns";

/* ------------------------------------------------------------------ *
 *  getAdoptableLines — what lines from this parent are still open?
 * ------------------------------------------------------------------ */

export async function getAdoptableLines(
  parentType: DocType,
  parentId: string,
): Promise<AdoptionParent | null> {
  const result = ((): AdoptionParent | null => {
    switch (parentType) {
      case "pr": {
        const pr = PURCHASE_REQUISITIONS.find((x) => x.id === parentId);
        if (!pr) return null;
        // Already adopted = sum of qty across RFQ lines that reference this PR line.
        const adoptedByRfq = (prLineId: string) =>
          RFQS.flatMap((r) => r.lines).reduce((s, l) => {
            return l.prLineIds?.includes(prLineId) ? s + l.qty : s;
          }, 0);
        return {
          docType: "pr",
          docId: pr.id,
          docNumber: pr.number,
          lines: pr.lines.map<AdoptionParentLine>((l) => {
            const remaining = Math.max(0, l.qty - adoptedByRfq(l.id));
            return {
              lineId: l.id,
              productId: l.productId,
              description: l.description,
              unitPrice: l.unitPrice,
              taxCodeId: l.taxCodeId,
              selected: remaining > 0,
              qty: remaining,
              maxQty: remaining,
            };
          }),
        };
      }
      case "rfq": {
        const rfq = RFQS.find((x) => x.id === parentId);
        if (!rfq) return null;
        const award = rfq.award;
        const awardedQuote = award ? rfq.quotes.find((q) => q.id === award.quoteId) : null;
        return {
          docType: "rfq",
          docId: rfq.id,
          docNumber: rfq.number,
          lines: rfq.lines.map<AdoptionParentLine>((l) => {
            const lineQuote = awardedQuote?.lineQuotes.find((lq) => lq.rfqLineId === l.id);
            return {
              lineId: l.id,
              productId: l.productId,
              description: l.description,
              unitPrice: lineQuote?.unitPrice ?? 0,
              taxCodeId: null,
              selected: true,
              qty: l.qty,
              maxQty: l.qty,
            };
          }),
        };
      }
      case "po": {
        const po = PURCHASE_ORDERS.find((x) => x.id === parentId);
        if (!po) return null;
        const adoptedByGrn = (poLineId: string) =>
          GOODS_RECEIPTS.filter((g) => g.poId === po.id)
            .flatMap((g) => g.lines)
            .reduce((s, l) => (l.poLineId === poLineId ? s + l.qtyReceived : s), 0);
        const adoptedByBill = (poLineId: string) =>
          VENDOR_BILLS.filter((b) => b.poId === po.id)
            .flatMap((b) => b.lines)
            .reduce((s, l) => (l.poLineId === poLineId ? s + l.qty : s), 0);
        return {
          docType: "po",
          docId: po.id,
          docNumber: po.number,
          lines: po.lines.map<AdoptionParentLine>((l) => {
            const received = adoptedByGrn(l.id);
            const billed = adoptedByBill(l.id);
            const remaining = Math.max(0, l.qty - Math.max(received, billed));
            return {
              lineId: l.id,
              productId: l.productId,
              description: l.description,
              unitPrice: l.unitPrice,
              taxCodeId: l.taxCodeId,
              selected: remaining > 0,
              qty: remaining,
              maxQty: remaining,
            };
          }),
        };
      }
      case "grn": {
        const grn = GOODS_RECEIPTS.find((x) => x.id === parentId);
        if (!grn) return null;
        const adoptedByReturn = (grnLineId: string) =>
          VENDOR_RETURNS.flatMap((v) => v.lines).reduce(
            (s, l) => (l.grnLineId === grnLineId ? s + l.qty : s),
            0,
          );
        return {
          docType: "grn",
          docId: grn.id,
          docNumber: grn.number,
          lines: grn.lines.map<AdoptionParentLine>((l) => {
            const returned = adoptedByReturn(l.id);
            const remaining = Math.max(0, l.qtyReceived - returned);
            return {
              lineId: l.id,
              productId: l.productId,
              description: l.description,
              unitPrice: l.unitPrice,
              taxCodeId: l.taxCodeId,
              selected: remaining > 0,
              qty: remaining,
              maxQty: remaining,
            };
          }),
        };
      }
      case "vendor_bill": {
        const b = VENDOR_BILLS.find((x) => x.id === parentId);
        if (!b) return null;
        const balance = Math.max(0, b.total - b.paid);
        return {
          docType: "vendor_bill",
          docId: b.id,
          docNumber: b.number,
          lines: [
            {
              lineId: "balance",
              productId: "",
              description: `Balance for ${b.invoiceNumber}`,
              unitPrice: balance,
              taxCodeId: null,
              selected: balance > 0,
              qty: 1,
              maxQty: 1,
            },
          ],
        };
      }
      case "vendor_return": {
        const vr = VENDOR_RETURNS.find((x) => x.id === parentId);
        if (!vr) return null;
        return {
          docType: "vendor_return",
          docId: vr.id,
          docNumber: vr.number,
          lines: vr.lines.map<AdoptionParentLine>((l) => ({
            lineId: l.id,
            productId: l.productId,
            description: l.description,
            unitPrice: l.unitPrice,
            taxCodeId: l.taxCodeId,
            selected: true,
            qty: l.qty,
            maxQty: l.qty,
          })),
        };
      }
      case "quote": {
        const qt = QUOTES.find((x) => x.id === parentId);
        if (!qt) return null;
        return {
          docType: "quote",
          docId: qt.id,
          docNumber: qt.number,
          lines: qt.lines.map<AdoptionParentLine>((l) => ({
            lineId: l.id,
            productId: l.productId,
            description: l.description,
            unitPrice: l.unitPrice,
            taxCodeId: l.taxCodeId,
            selected: true,
            qty: l.qty,
            maxQty: l.qty,
          })),
        };
      }
      case "so": {
        const so = SALES_ORDERS.find((x) => x.id === parentId);
        if (!so) return null;
        const adoptedByDn = (soLineId: string) =>
          DELIVERY_NOTES.filter((d) => d.soId === so.id)
            .flatMap((d) => d.lines)
            .reduce((s, l) => (l.soLineId === soLineId ? s + l.qtyDelivered : s), 0);
        const adoptedByInv = (soLineId: string) =>
          CUSTOMER_INVOICES.filter((i) => i.soId === so.id)
            .flatMap((i) => i.lines)
            .reduce((s, l) => (l.soLineId === soLineId ? s + l.qty : s), 0);
        return {
          docType: "so",
          docId: so.id,
          docNumber: so.number,
          lines: so.lines.map<AdoptionParentLine>((l) => {
            const delivered = adoptedByDn(l.id);
            const invoiced = adoptedByInv(l.id);
            const remaining = Math.max(0, l.qty - Math.max(delivered, invoiced));
            return {
              lineId: l.id,
              productId: l.productId,
              description: l.description,
              unitPrice: l.unitPrice,
              taxCodeId: l.taxCodeId,
              selected: remaining > 0,
              qty: remaining,
              maxQty: remaining,
            };
          }),
        };
      }
      case "dn": {
        const dn = DELIVERY_NOTES.find((x) => x.id === parentId);
        if (!dn) return null;
        const adoptedByReturn = (dnLineId: string) =>
          CUSTOMER_RETURNS.flatMap((c) => c.lines).reduce(
            (s, l) => (l.dnLineId === dnLineId ? s + l.qty : s),
            0,
          );
        return {
          docType: "dn",
          docId: dn.id,
          docNumber: dn.number,
          lines: dn.lines.map<AdoptionParentLine>((l) => {
            const returned = adoptedByReturn(l.id);
            const remaining = Math.max(0, l.qtyDelivered - returned);
            return {
              lineId: l.id,
              productId: l.productId,
              description: l.description,
              unitPrice: l.unitPrice,
              taxCodeId: l.taxCodeId,
              selected: remaining > 0,
              qty: remaining,
              maxQty: remaining,
            };
          }),
        };
      }
      case "customer_invoice": {
        const inv = CUSTOMER_INVOICES.find((x) => x.id === parentId);
        if (!inv) return null;
        const balance = Math.max(0, inv.total - inv.paid);
        return {
          docType: "customer_invoice",
          docId: inv.id,
          docNumber: inv.number,
          lines: [
            {
              lineId: "balance",
              productId: "",
              description: `Balance for ${inv.number}`,
              unitPrice: balance,
              taxCodeId: null,
              selected: balance > 0,
              qty: 1,
              maxQty: 1,
            },
          ],
        };
      }
      case "customer_return": {
        const cr = CUSTOMER_RETURNS.find((x) => x.id === parentId);
        if (!cr) return null;
        return {
          docType: "customer_return",
          docId: cr.id,
          docNumber: cr.number,
          lines: cr.lines.map<AdoptionParentLine>((l) => ({
            lineId: l.id,
            productId: l.productId,
            description: l.description,
            unitPrice: l.unitPrice,
            taxCodeId: l.taxCodeId,
            selected: true,
            qty: l.qty,
            maxQty: l.qty,
          })),
        };
      }
      default:
        return null;
    }
  })();
  return result;
}

/* ------------------------------------------------------------------ *
 *  Ancestry / descendants
 * ------------------------------------------------------------------ */

type Node = { docType: DocType; docId: string };

/** Return the immediate parents of a doc (one hop upward). */
function parentsOf(n: Node): Node[] {
  switch (n.docType) {
    case "rfq": {
      const rfq = RFQS.find((x) => x.id === n.docId);
      return rfq ? rfq.prIds.map((id) => ({ docType: "pr", docId: id })) : [];
    }
    case "po": {
      const po = PURCHASE_ORDERS.find((x) => x.id === n.docId);
      const ps: Node[] = [];
      if (po?.prId) ps.push({ docType: "pr", docId: po.prId });
      // RFQ → PO link is in RFQ.award.poId
      const rfq = RFQS.find((r) => r.award?.poId === n.docId);
      if (rfq) ps.push({ docType: "rfq", docId: rfq.id });
      return ps;
    }
    case "grn": {
      const grn = GOODS_RECEIPTS.find((x) => x.id === n.docId);
      return grn ? [{ docType: "po", docId: grn.poId }] : [];
    }
    case "vendor_bill": {
      const b = VENDOR_BILLS.find((x) => x.id === n.docId);
      const ps: Node[] = [];
      if (b?.poId) ps.push({ docType: "po", docId: b.poId });
      if (b?.grnId) ps.push({ docType: "grn", docId: b.grnId });
      return ps;
    }
    case "vendor_payment": {
      const vp = VENDOR_PAYMENTS.find((x) => x.id === n.docId);
      return vp ? vp.allocations.map((a) => ({ docType: "vendor_bill" as DocType, docId: a.billId })) : [];
    }
    case "vendor_return": {
      const vr = VENDOR_RETURNS.find((x) => x.id === n.docId);
      return vr ? [{ docType: "grn", docId: vr.grnId }] : [];
    }
    case "debit_note": {
      const dn = DEBIT_NOTES.find((x) => x.id === n.docId);
      return dn ? [{ docType: "vendor_return", docId: dn.vendorReturnId }] : [];
    }
    case "so": {
      const so = SALES_ORDERS.find((x) => x.id === n.docId);
      return so?.quoteId ? [{ docType: "quote", docId: so.quoteId }] : [];
    }
    case "dn": {
      const dn = DELIVERY_NOTES.find((x) => x.id === n.docId);
      return dn ? [{ docType: "so", docId: dn.soId }] : [];
    }
    case "customer_invoice": {
      const inv = CUSTOMER_INVOICES.find((x) => x.id === n.docId);
      const ps: Node[] = [];
      if (inv?.soId) ps.push({ docType: "so", docId: inv.soId });
      if (inv?.dnId) ps.push({ docType: "dn", docId: inv.dnId });
      return ps;
    }
    case "customer_receipt": {
      const rcp = CUSTOMER_RECEIPTS.find((x) => x.id === n.docId);
      return rcp ? rcp.allocations.map((a) => ({ docType: "customer_invoice" as DocType, docId: a.invoiceId })) : [];
    }
    case "customer_return": {
      const cr = CUSTOMER_RETURNS.find((x) => x.id === n.docId);
      return cr ? [{ docType: "dn", docId: cr.dnId }] : [];
    }
    case "credit_note": {
      const cn = CREDIT_NOTES.find((x) => x.id === n.docId);
      return cn ? [{ docType: "customer_return", docId: cn.customerReturnId }] : [];
    }
    default:
      return [];
  }
}

/** Return the immediate children of a doc (one hop downward). */
function childrenOf(n: Node): Node[] {
  const c: Node[] = [];
  switch (n.docType) {
    case "pr": {
      RFQS.filter((r) => r.prIds.includes(n.docId)).forEach((r) =>
        c.push({ docType: "rfq", docId: r.id }),
      );
      PURCHASE_ORDERS.filter((p) => p.prId === n.docId).forEach((p) =>
        c.push({ docType: "po", docId: p.id }),
      );
      break;
    }
    case "rfq": {
      const rfq = RFQS.find((x) => x.id === n.docId);
      if (rfq?.award?.poId) c.push({ docType: "po", docId: rfq.award.poId });
      break;
    }
    case "po": {
      GOODS_RECEIPTS.filter((g) => g.poId === n.docId).forEach((g) =>
        c.push({ docType: "grn", docId: g.id }),
      );
      VENDOR_BILLS.filter((b) => b.poId === n.docId).forEach((b) =>
        c.push({ docType: "vendor_bill", docId: b.id }),
      );
      break;
    }
    case "grn": {
      VENDOR_BILLS.filter((b) => b.grnId === n.docId).forEach((b) =>
        c.push({ docType: "vendor_bill", docId: b.id }),
      );
      VENDOR_RETURNS.filter((v) => v.grnId === n.docId).forEach((v) =>
        c.push({ docType: "vendor_return", docId: v.id }),
      );
      break;
    }
    case "vendor_bill": {
      VENDOR_PAYMENTS.filter((vp) => vp.allocations.some((a) => a.billId === n.docId)).forEach(
        (vp) => c.push({ docType: "vendor_payment", docId: vp.id }),
      );
      break;
    }
    case "vendor_return": {
      DEBIT_NOTES.filter((d) => d.vendorReturnId === n.docId).forEach((d) =>
        c.push({ docType: "debit_note", docId: d.id }),
      );
      break;
    }
    case "quote": {
      SALES_ORDERS.filter((s) => s.quoteId === n.docId).forEach((s) =>
        c.push({ docType: "so", docId: s.id }),
      );
      break;
    }
    case "so": {
      DELIVERY_NOTES.filter((d) => d.soId === n.docId).forEach((d) =>
        c.push({ docType: "dn", docId: d.id }),
      );
      CUSTOMER_INVOICES.filter((i) => i.soId === n.docId).forEach((i) =>
        c.push({ docType: "customer_invoice", docId: i.id }),
      );
      break;
    }
    case "dn": {
      CUSTOMER_INVOICES.filter((i) => i.dnId === n.docId).forEach((i) =>
        c.push({ docType: "customer_invoice", docId: i.id }),
      );
      CUSTOMER_RETURNS.filter((r) => r.dnId === n.docId).forEach((r) =>
        c.push({ docType: "customer_return", docId: r.id }),
      );
      break;
    }
    case "customer_invoice": {
      CUSTOMER_RECEIPTS.filter((r) => r.allocations.some((a) => a.invoiceId === n.docId)).forEach(
        (r) => c.push({ docType: "customer_receipt", docId: r.id }),
      );
      break;
    }
    case "customer_return": {
      CREDIT_NOTES.filter((c2) => c2.customerReturnId === n.docId).forEach((c2) =>
        c.push({ docType: "credit_note", docId: c2.id }),
      );
      break;
    }
  }
  return c;
}

function descriptorFor(n: Node): { docNumber: string; state: string } | null {
  switch (n.docType) {
    case "pr": {
      const x = PURCHASE_REQUISITIONS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "rfq": {
      const x = RFQS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "po": {
      const x = PURCHASE_ORDERS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "grn": {
      const x = GOODS_RECEIPTS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "vendor_bill": {
      const x = VENDOR_BILLS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "vendor_payment": {
      const x = VENDOR_PAYMENTS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "vendor_return": {
      const x = VENDOR_RETURNS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "debit_note": {
      const x = DEBIT_NOTES.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "quote": {
      const x = QUOTES.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: String(x.state) } : null;
    }
    case "so": {
      const x = SALES_ORDERS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "dn": {
      const x = DELIVERY_NOTES.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "customer_invoice": {
      const x = CUSTOMER_INVOICES.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "customer_receipt": {
      const x = CUSTOMER_RECEIPTS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "customer_return": {
      const x = CUSTOMER_RETURNS.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    case "credit_note": {
      const x = CREDIT_NOTES.find((d) => d.id === n.docId);
      return x ? { docNumber: x.number, state: x.state } : null;
    }
    default:
      return null;
  }
}

function buildTree(
  n: Node,
  expander: (n: Node) => Node[],
  visited: Set<string> = new Set(),
): AdoptionTreeNode | null {
  const key = `${n.docType}:${n.docId}`;
  if (visited.has(key)) return null;
  visited.add(key);
  const d = descriptorFor(n);
  if (!d) return null;
  return {
    docType: n.docType,
    docId: n.docId,
    docNumber: d.docNumber,
    state: d.state,
    children: expander(n)
      .map((c) => buildTree(c, expander, visited))
      .filter((x): x is AdoptionTreeNode => x !== null),
  };
}

export async function getAncestry(docType: DocType, docId: string): Promise<AdoptionTreeNode | null> {
  return buildTree({ docType, docId }, parentsOf);
}

export async function getDescendants(docType: DocType, docId: string): Promise<AdoptionTreeNode | null> {
  return buildTree({ docType, docId }, childrenOf);
}

/* ------------------------------------------------------------------ *
 *  recordAdoptions — toast-only persistence (matches F0 fake-service pattern)
 * ------------------------------------------------------------------ */

const ADOPTION_LOG_KEY = "atmata.adoption.log";

export async function recordAdoptions(edges: AdoptionEdge[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const prev: AdoptionEdge[] = JSON.parse(
      window.sessionStorage.getItem(ADOPTION_LOG_KEY) ?? "[]",
    );
    window.sessionStorage.setItem(
      ADOPTION_LOG_KEY,
      JSON.stringify([...prev, ...edges]),
    );
    // eslint-disable-next-line no-console
    console.info("atmata:event", "adoption.recorded", { count: edges.length });
  } catch {
    /* ignore */
  }
}

export function readAdoptionLog(): AdoptionEdge[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(ADOPTION_LOG_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 *  stashAdoptionContext — used by adoption-trigger UI to hand off to /new forms
 * ------------------------------------------------------------------ */

export function adoptionStorageKey(targetType: DocType): string {
  return `atmata.adopting.${targetType}`;
}

export function stashAdoptionContext(ctx: AdoptionContext): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(adoptionStorageKey(ctx.targetType), JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function readAdoptionContext(targetType: DocType): AdoptionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(adoptionStorageKey(targetType));
    return raw ? (JSON.parse(raw) as AdoptionContext) : null;
  } catch {
    return null;
  }
}

export function clearAdoptionContext(targetType: DocType): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(adoptionStorageKey(targetType));
  } catch {
    /* ignore */
  }
}
