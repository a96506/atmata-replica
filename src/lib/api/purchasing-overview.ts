import { refreshMetricsIfStale } from "@/lib/api/metrics-refresh";
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
import { listTable } from "@/lib/db/read";
import { PURCHASING_SELECTS } from "@/lib/db/selects";

export type PurchasingOverview = {
  po_suggestions: Array<{
    id: string;
    prId: string;
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
  price_alerts: Array<{
    vendor: string;
    product: string;
    change_pct: number;
    note: string;
    alert_type: string;
    detected_at: string;
  }>;
  purchase_history: Array<{
    date: string;
    po: string;
    vendor: string;
    amount: number;
  }>;
  vendor_scores: Array<{
    vendor: string;
    score: number;
    on_time_pct: number;
    quality_pct: number;
    computed_at: string;
  }>;
  receiving: Array<{
    id: string;
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

type VendorScoreRow = {
  supplierId: string;
  score: number;
  onTimePct: number;
  qualityPct: number;
  computedAt: string;
};

async function listVendorScores(): Promise<VendorScoreRow[]> {
  return listTable<VendorScoreRow>(
    "vendor_scores",
    PURCHASING_SELECTS.vendor_scores,
    [{ column: "score", ascending: false }],
  ).catch(() => []);
}

type PriceAlertRow = {
  productId: string;
  sku: string;
  supplierId: string;
  alertType: string;
  message: string;
  changePct: number;
  detectedAt: string;
};

async function listPriceAlerts(): Promise<PriceAlertRow[]> {
  return listTable<PriceAlertRow>(
    "price_alerts",
    PURCHASING_SELECTS.price_alerts,
    [{ column: "detected_at", ascending: false }],
  ).catch(() => []);
}

export async function getPurchasingOverview(): Promise<PurchasingOverview> {
  await refreshMetricsIfStale().catch(() => {});

  const [prs, pos, bills, grns, suppliers, products, scoreRows, alertRows] =
    await Promise.all([
      listPurchaseRequisitions().catch(() => []),
      listPurchaseOrders().catch(() => []),
      listVendorBills().catch(() => []),
      listGoodsReceipts().catch(() => []),
      listSuppliers().catch(() => []),
      listProducts().catch(() => []),
      listVendorScores(),
      listPriceAlerts(),
    ]);

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const poNumber = new Map(pos.map((p) => [p.id, p.number]));
  const productName = new Map(products.map((p) => [p.id, p.name]));

  const po_suggestions = prs
    .filter((pr) => pr.state === "draft" || pr.state === "pending")
    .flatMap((pr) =>
      (pr.lines ?? []).map((line, idx) => ({
        id: `${pr.number}-${idx + 1}`,
        prId: pr.id,
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
        id: g.id,
        ref: g.number,
        po: poNumber.get(g.poId) ?? g.poId,
        status,
        expected,
        received,
        flag,
      };
    });

  const vendor_scores = scoreRows.map((row) => ({
    vendor: supplierName.get(row.supplierId) ?? "—",
    score: Number(row.score),
    on_time_pct: Number(row.onTimePct),
    quality_pct: Number(row.qualityPct),
    computed_at: row.computedAt,
  }));

  const price_alerts = alertRows.map((row) => ({
    vendor: supplierName.get(row.supplierId) ?? "—",
    product: productName.get(row.productId) ?? row.sku,
    change_pct: Number(row.changePct),
    note: row.message,
    alert_type: row.alertType,
    detected_at: row.detectedAt,
  }));

  return {
    po_suggestions,
    bill_matches,
    price_alerts,
    purchase_history,
    vendor_scores,
    receiving,
  };
}
