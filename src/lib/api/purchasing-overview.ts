import {
  listProducts,
  listSuppliers,
} from "@/lib/api/master";
import {
  listGoodsReceipts,
  listPurchaseOrders,
  listPurchaseRequisitions,
  listVendorBills,
} from "@/lib/api/p2p";

export type PurchasingOverview = {
  po_suggestions: Array<{
    id: string;
    product: string;
    vendor: string;
    qty: number;
    est_unit: number;
    severity: "high" | "medium" | "low";
  }>;
  bill_matches: Array<{
    id: string;
    vendor: string;
    bill_ref: string;
    po_ref: string;
    status: "matched" | "discrepancy" | "review";
    discrepancy: string | null;
  }>;
  /**
   * No backend — deferred: no price_alerts table/RPC
   * (price_list_items are static; no change history).
   */
  price_alerts: Array<{
    vendor: string;
    product: string;
    change_pct: number;
    note: string;
  }>;
  purchase_history: Array<{
    date: string;
    po: string;
    vendor: string;
    amount: number;
  }>;
  /**
   * No backend — deferred: suppliers have no score/rating columns
   * (unlike customers.credit_score).
   */
  vendor_scores: Array<{
    vendor: string;
    score: number;
    lead_days: number;
    quality: "high" | "medium";
    price_rank: number;
  }>;
  receiving: Array<{
    ref: string;
    po: string;
    status: "partial" | "ready";
    expected: number;
    received: number;
    flag: "short" | null;
  }>;
};

function suggestionSeverity(
  neededBy: string | undefined,
): "high" | "medium" | "low" {
  if (!neededBy) return "medium";
  const today = new Date();
  const due = new Date(neededBy);
  const days = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 3) return "high";
  if (days <= 14) return "medium";
  return "low";
}

export async function getPurchasingOverview(): Promise<PurchasingOverview> {
  const [prs, pos, bills, grns, suppliers, products] = await Promise.all([
    listPurchaseRequisitions().catch(() => []),
    listPurchaseOrders().catch(() => []),
    listVendorBills().catch(() => []),
    listGoodsReceipts().catch(() => []),
    listSuppliers().catch(() => []),
    listProducts().catch(() => []),
  ]);

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const poNumber = new Map(pos.map((p) => [p.id, p.number]));
  const productName = new Map(products.map((p) => [p.id, p.name]));

  const po_suggestions = prs
    .filter((pr) => pr.state === "draft" || pr.state === "pending")
    .flatMap((pr) =>
      (pr.lines ?? []).map((line, idx) => ({
        id: `${pr.number}-${idx + 1}`,
        product:
          line.description ||
          productName.get(line.productId) ||
          line.productId,
        vendor: "—",
        qty: line.qty,
        est_unit: line.unitPrice,
        severity: suggestionSeverity(pr.neededBy),
      })),
    );

  const bill_matches = bills.map((b) => ({
    id: b.id,
    vendor: supplierName.get(b.supplierId) ?? "—",
    bill_ref: b.number,
    po_ref: b.poId ? (poNumber.get(b.poId) ?? b.poId) : "—",
    status: b.threeWayMatch,
    discrepancy: b.discrepancyReason ?? null,
  }));

  const purchase_history = pos.map((p) => ({
    date: p.date,
    po: p.number,
    vendor: supplierName.get(p.supplierId) ?? "—",
    amount: p.total,
  }));

  const receiving = grns
    .filter((g) => g.state !== "cancelled" && g.state !== "archived")
    .map((g) => {
      const expected = (g.lines ?? []).reduce(
        (s, l) => s + Number(l.qty ?? 0),
        0,
      );
      const received = (g.lines ?? []).reduce(
        (s, l) => s + Number(l.qtyReceived ?? 0),
        0,
      );
      const status: "partial" | "ready" =
        received > 0 && received < expected ? "partial" : "ready";
      const flag: "short" | null =
        received > 0 && received < expected ? "short" : null;
      return {
        ref: g.number,
        po: poNumber.get(g.poId) ?? g.poId,
        status,
        expected,
        received,
        flag,
      };
    });

  return {
    po_suggestions,
    bill_matches,
    price_alerts: [],
    purchase_history,
    vendor_scores: [],
    receiving,
  };
}
