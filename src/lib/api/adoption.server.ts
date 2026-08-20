import type {
  AdoptionParent,
  AdoptionParentLine,
  AdoptionTreeNode,
  DocType,
} from "@/types";
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
import { listRfqs } from "./rfq";
import {
  listCreditNotes,
  listCustomerReturns,
  listDebitNotes,
  listVendorReturns,
} from "./returns";

async function loadGraph() {
  const [
    prs,
    pos,
    grns,
    bills,
    payments,
    quotes,
    salesOrders,
    deliveries,
    invoices,
    receipts,
    rfqs,
    vendorReturns,
    debitNotes,
    customerReturns,
    creditNotes,
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
    listRfqs(),
    listVendorReturns(),
    listDebitNotes(),
    listCustomerReturns(),
    listCreditNotes(),
  ]);
  return {
    prs,
    pos,
    grns,
    bills,
    payments,
    quotes,
    salesOrders,
    deliveries,
    invoices,
    receipts,
    rfqs,
    vendorReturns,
    debitNotes,
    customerReturns,
    creditNotes,
  };
}

const line = (
  value: {
    id: string;
    productId: string;
    description: string;
    unitPrice: number;
    taxCodeId: string | null;
  },
  qty: number,
): AdoptionParentLine => ({
  lineId: value.id,
  productId: value.productId,
  description: value.description,
  unitPrice: value.unitPrice,
  taxCodeId: value.taxCodeId,
  selected: qty > 0,
  qty,
  maxQty: qty,
});

export async function getAdoptableLines(
  parentType: DocType,
  parentId: string,
): Promise<AdoptionParent | null> {
  const g = await loadGraph();
  if (parentType === "pr") {
    const doc = g.prs.find((item) => item.id === parentId);
    if (!doc) return null;
    return {
      docType: parentType,
      docId: doc.id,
      docNumber: doc.number,
      lines: doc.lines.map((item) => {
        const used = g.rfqs
          .flatMap((rfq) => rfq.lines)
          .filter((rfqLine) => rfqLine.prLineIds?.includes(item.id))
          .reduce((sum, rfqLine) => sum + rfqLine.qty, 0);
        return line(item, Math.max(0, item.qty - used));
      }),
    };
  }
  if (parentType === "rfq") {
    const doc = g.rfqs.find((item) => item.id === parentId);
    if (!doc) return null;
    const awarded = doc.award
      ? doc.quotes.find((quote) => quote.id === doc.award?.quoteId)
      : null;
    return {
      docType: parentType,
      docId: doc.id,
      docNumber: doc.number,
      lines: doc.lines.map((item) => {
        const quote = awarded?.lineQuotes.find((entry) => entry.rfqLineId === item.id);
        return line({ ...item, unitPrice: quote?.unitPrice ?? 0, taxCodeId: null }, item.qty);
      }),
    };
  }
  if (parentType === "po") {
    const doc = g.pos.find((item) => item.id === parentId);
    if (!doc) return null;
    return {
      docType: parentType,
      docId: doc.id,
      docNumber: doc.number,
      lines: doc.lines.map((item) => {
        const received = g.grns
          .filter((grn) => grn.poId === doc.id)
          .flatMap((grn) => grn.lines)
          .filter((grnLine) => grnLine.poLineId === item.id)
          .reduce((sum, grnLine) => sum + grnLine.qtyReceived, 0);
        const billed = g.bills
          .filter((bill) => bill.poId === doc.id)
          .flatMap((bill) => bill.lines)
          .filter((billLine) => billLine.poLineId === item.id)
          .reduce((sum, billLine) => sum + billLine.qty, 0);
        return line(item, Math.max(0, item.qty - Math.max(received, billed)));
      }),
    };
  }
  if (parentType === "grn") {
    const doc = g.grns.find((item) => item.id === parentId);
    if (!doc) return null;
    return {
      docType: parentType,
      docId: doc.id,
      docNumber: doc.number,
      lines: doc.lines.map((item) => {
        const returned = g.vendorReturns
          .flatMap((value) => value.lines)
          .filter((value) => value.grnLineId === item.id)
          .reduce((sum, value) => sum + value.qty, 0);
        return line(item, Math.max(0, item.qtyReceived - returned));
      }),
    };
  }
  if (parentType === "so") {
    const doc = g.salesOrders.find((item) => item.id === parentId);
    if (!doc) return null;
    return {
      docType: parentType,
      docId: doc.id,
      docNumber: doc.number,
      lines: doc.lines.map((item) => {
        const delivered = g.deliveries
          .filter((delivery) => delivery.soId === doc.id)
          .flatMap((delivery) => delivery.lines)
          .filter((deliveryLine) => deliveryLine.soLineId === item.id)
          .reduce((sum, deliveryLine) => sum + deliveryLine.qtyDelivered, 0);
        const invoiced = g.invoices
          .filter((invoice) => invoice.soId === doc.id)
          .flatMap((invoice) => invoice.lines)
          .filter((invoiceLine) => invoiceLine.soLineId === item.id)
          .reduce((sum, invoiceLine) => sum + invoiceLine.qty, 0);
        return line(item, Math.max(0, item.qty - Math.max(delivered, invoiced)));
      }),
    };
  }
  if (parentType === "dn") {
    const doc = g.deliveries.find((item) => item.id === parentId);
    if (!doc) return null;
    return {
      docType: parentType,
      docId: doc.id,
      docNumber: doc.number,
      lines: doc.lines.map((item) => {
        const returned = g.customerReturns
          .flatMap((value) => value.lines)
          .filter((value) => value.dnLineId === item.id)
          .reduce((sum, value) => sum + value.qty, 0);
        return line(item, Math.max(0, item.qtyDelivered - returned));
      }),
    };
  }
  const lineDocs = [
    ...g.vendorReturns.map((doc) => ({ type: "vendor_return" as const, doc })),
    ...g.quotes.map((doc) => ({ type: "quote" as const, doc })),
    ...g.customerReturns.map((doc) => ({ type: "customer_return" as const, doc })),
  ];
  const lineDoc = lineDocs.find(({ type, doc }) => type === parentType && doc.id === parentId);
  if (lineDoc) {
    return {
      docType: parentType,
      docId: lineDoc.doc.id,
      docNumber: lineDoc.doc.number,
      lines: lineDoc.doc.lines.map((item) => line(item, item.qty)),
    };
  }
  if (parentType === "vendor_bill" || parentType === "customer_invoice") {
    const doc =
      parentType === "vendor_bill"
        ? g.bills.find((item) => item.id === parentId)
        : g.invoices.find((item) => item.id === parentId);
    if (!doc) return null;
    const balance = Math.max(0, doc.total - doc.paid);
    return {
      docType: parentType,
      docId: doc.id,
      docNumber: doc.number,
      lines: [
        {
          lineId: "balance",
          productId: "",
          description: `Balance for ${doc.number}`,
          unitPrice: balance,
          taxCodeId: null,
          selected: balance > 0,
          qty: 1,
          maxQty: 1,
        },
      ],
    };
  }
  return null;
}

type Node = { docType: DocType; docId: string };

async function tree(
  root: Node,
  direction: "parents" | "children",
): Promise<AdoptionTreeNode | null> {
  const g = await loadGraph();
  const descriptors = new Map<string, { docNumber: string; state: string }>();
  const parentMap = new Map<string, Node[]>();
  const add = (type: DocType, doc: { id: string; number: string; state: string }, parents: Node[]) => {
    const key = `${type}:${doc.id}`;
    descriptors.set(key, { docNumber: doc.number, state: doc.state });
    parentMap.set(key, parents);
  };
  g.prs.forEach((doc) => add("pr", doc, []));
  g.rfqs.forEach((doc) =>
    add("rfq", doc, doc.prIds.map((id) => ({ docType: "pr", docId: id }))),
  );
  g.pos.forEach((doc) => {
    const parents: Node[] = doc.prId ? [{ docType: "pr", docId: doc.prId }] : [];
    const rfq = g.rfqs.find((item) => item.award?.poId === doc.id);
    if (rfq) parents.push({ docType: "rfq", docId: rfq.id });
    add("po", doc, parents);
  });
  g.grns.forEach((doc) => add("grn", doc, [{ docType: "po", docId: doc.poId }]));
  g.bills.forEach((doc) =>
    add("vendor_bill", doc, [
      ...(doc.poId ? [{ docType: "po" as const, docId: doc.poId }] : []),
      ...(doc.grnId ? [{ docType: "grn" as const, docId: doc.grnId }] : []),
    ]),
  );
  g.payments.forEach((doc) =>
    add(
      "vendor_payment",
      doc,
      doc.allocations.map((value) => ({ docType: "vendor_bill", docId: value.billId })),
    ),
  );
  g.vendorReturns.forEach((doc) =>
    add("vendor_return", doc, [{ docType: "grn", docId: doc.grnId }]),
  );
  g.debitNotes.forEach((doc) =>
    add("debit_note", doc, [{ docType: "vendor_return", docId: doc.vendorReturnId }]),
  );
  g.quotes.forEach((doc) => add("quote", doc, []));
  g.salesOrders.forEach((doc) =>
    add("so", doc, doc.quoteId ? [{ docType: "quote", docId: doc.quoteId }] : []),
  );
  g.deliveries.forEach((doc) => add("dn", doc, [{ docType: "so", docId: doc.soId }]));
  g.invoices.forEach((doc) =>
    add("customer_invoice", doc, [
      ...(doc.soId ? [{ docType: "so" as const, docId: doc.soId }] : []),
      ...(doc.dnId ? [{ docType: "dn" as const, docId: doc.dnId }] : []),
    ]),
  );
  g.receipts.forEach((doc) =>
    add(
      "customer_receipt",
      doc,
      doc.allocations.map((value) => ({
        docType: "customer_invoice",
        docId: value.invoiceId,
      })),
    ),
  );
  g.customerReturns.forEach((doc) =>
    add("customer_return", doc, [{ docType: "dn", docId: doc.dnId }]),
  );
  g.creditNotes.forEach((doc) =>
    add("credit_note", doc, [
      { docType: "customer_return", docId: doc.customerReturnId },
    ]),
  );

  const childMap = new Map<string, Node[]>();
  for (const [childKey, parents] of parentMap) {
    const [docType, ...idParts] = childKey.split(":");
    const child = { docType: docType as DocType, docId: idParts.join(":") };
    for (const parent of parents) {
      const key = `${parent.docType}:${parent.docId}`;
      childMap.set(key, [...(childMap.get(key) ?? []), child]);
    }
  }

  const walk = (node: Node, visited: Set<string>, depth: number): AdoptionTreeNode | null => {
    const key = `${node.docType}:${node.docId}`;
    if (depth > 32 || visited.has(key)) return null;
    const descriptor = descriptors.get(key);
    if (!descriptor) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(key);
    const next = direction === "parents" ? parentMap.get(key) : childMap.get(key);
    return {
      ...node,
      ...descriptor,
      children: (next ?? [])
        .map((child) => walk(child, nextVisited, depth + 1))
        .filter((child): child is AdoptionTreeNode => child !== null),
    };
  };
  return walk(root, new Set(), 0);
}

export function getAncestry(docType: DocType, docId: string) {
  return tree({ docType, docId }, "parents");
}

export function getDescendants(docType: DocType, docId: string) {
  return tree({ docType, docId }, "children");
}
