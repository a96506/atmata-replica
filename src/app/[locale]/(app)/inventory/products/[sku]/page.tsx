import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { SparkLine } from "@/components/charts/SparkLine";
import {
  getItemCustomers,
  getItemLots,
  getItemMoves,
  getItemPurchaseHistory,
  getItemSalesHistory,
  getItemSnapshot,
  getItemStockByWarehouse,
  getItemVendors,
  getProductBySku,
} from "@/lib/api/items";

const STATES = [{ id: "active", label: "Active" }];

const SOURCE_HREF: Record<string, (locale: string, id: string) => string> = {
  grn: (l, id) => `/${l}/purchasing/goods-receipts/${id}`,
  delivery_note: (l, id) => `/${l}/sales/deliveries/${id}`,
  internal_transfer: (l, id) => `/${l}/inventory/transfers/${id}`,
  stock_adjustment: (l, id) => `/${l}/inventory/adjustments/${id}`,
};

export default async function Page({
  params,
}: {
  params: Promise<{ sku: string; locale: string }>;
}) {
  const { sku, locale } = await params;
  const product = await getProductBySku(decodeURIComponent(sku));
  if (!product) notFound();

  const [snapshot, byWarehouse, moves, lots, purchases, sales, vendors, customers] =
    await Promise.all([
      getItemSnapshot(product.id),
      getItemStockByWarehouse(product.id),
      getItemMoves(product.id),
      getItemLots(product.id),
      getItemPurchaseHistory(product.id),
      getItemSalesHistory(product.id),
      getItemVendors(product.id),
      getItemCustomers(product.id),
    ]);

  const purchaseSpark = purchases.map((p) => ({ x: p.date, y: p.unitPrice }));
  const salesSpark = sales.map((s) => ({ x: s.date, y: s.unitPrice }));

  // AI insights — deterministic rules over snapshot.
  const aiCards = buildAiCards(snapshot, lots);

  return (
    <DocumentLayout
      number={product.sku}
      title={product.name}
      subtitle={`UoM ${product.uom} · costing ${product.costingMethod}${product.lotTracked ? " · lot-tracked" : ""}`}
      states={STATES}
      currentState="active"
      loadedAt={new Date().toISOString()}
      totals={
        <div className="grid grid-cols-3 gap-3 text-right text-sm">
          <Stat label="On hand" value={snapshot?.onHand ?? 0} />
          <Stat label="Last cost" value={snapshot?.lastCost?.toFixed(3) ?? "—"} />
          <Stat label="Last price" value={snapshot?.lastSalePrice?.toFixed(3) ?? "—"} />
        </div>
      }
      tabs={[
        {
          id: "overview",
          label: "Overview",
          content: (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="On hand" value={snapshot?.onHand ?? 0} />
              <Kpi label="Open PO lines" value={snapshot?.openPoLines ?? 0} />
              <Kpi label="Open SO lines" value={snapshot?.openSoLines ?? 0} />
              <Kpi label="Lots active" value={lots.length} />
              <Kpi label="POs in history" value={purchases.length} />
              <Kpi label="Invoices in history" value={sales.length} />
              <Kpi label="Top vendors" value={vendors.length} />
              <Kpi label="Top customers" value={customers.length} />
            </div>
          ),
        },
        {
          id: "warehouses",
          label: `By warehouse (${byWarehouse.length})`,
          content: (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3 text-right">In moves</th>
                    <th className="px-4 py-3 text-right">Out moves</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {byWarehouse.map((r) => (
                    <tr key={r.warehouseId}>
                      <td className="px-4 py-3">{r.warehouseName}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{r.onHand}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.inMoves}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.outMoves}</td>
                    </tr>
                  ))}
                  {byWarehouse.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No stock recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "moves",
          label: `Stock moves (${moves.length})`,
          content: (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Dir</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3">Lot</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {moves.map((m) => {
                    const hrefFn = SOURCE_HREF[m.sourceType];
                    return (
                      <tr key={m.id}>
                        <td className="px-4 py-3">{m.date}</td>
                        <td className="px-4 py-3">{m.warehouseName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-xs font-medium " +
                              (m.direction === "in"
                                ? "bg-status-success-muted text-status-success-foreground"
                                : "bg-status-danger-muted text-destructive")
                            }
                          >
                            {m.direction === "in" ? "IN" : "OUT"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {m.direction === "in" ? "+" : "-"}
                          {m.qty}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{m.costPerUnit.toFixed(3)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.lotNumber ?? "—"}</td>
                        <td className="px-4 py-3 text-xs">
                          {hrefFn ? (
                            <Link
                              href={hrefFn(locale, m.sourceId)}
                              className="text-primary hover:underline"
                            >
                              {m.sourceType} · {m.sourceId}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">
                              {m.sourceType} · {m.sourceId}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "lots",
          label: `Lots (${lots.length})`,
          content: lots.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {product.lotTracked
                ? "No lot history yet."
                : "This product is not lot-tracked."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Lot</th>
                    <th className="px-4 py-3">By warehouse</th>
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3">First seen</th>
                    <th className="px-4 py-3">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lots.map((lot) => (
                    <tr key={lot.lotNumber}>
                      <td className="px-4 py-3 font-mono text-xs">{lot.lotNumber}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {lot.byWarehouse
                          .map((w) => `${w.warehouseName}: ${w.onHand}`)
                          .join(" · ")}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{lot.totalOnHand}</td>
                      <td className="px-4 py-3">{lot.firstSeen}</td>
                      <td className="px-4 py-3">{lot.lastSeen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "purchases",
          label: `Purchase history (${purchases.length})`,
          content: (
            <div className="space-y-4">
              {purchaseSpark.length > 1 ? (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Unit price over time
                  </div>
                  <SparkLine points={purchaseSpark} ariaLabel="Purchase unit price over time" />
                </div>
              ) : null}
              <HistoryTable
                rows={purchases.map((p) => ({
                  date: p.date,
                  partner: p.supplierName,
                  ref: (
                    <Link
                      href={`/${locale}/purchasing/purchase-orders/${p.docId}`}
                      className="text-primary hover:underline"
                    >
                      {p.docNumber}
                    </Link>
                  ),
                  qty: p.qty,
                  unitPrice: p.unitPrice,
                  total: p.total,
                }))}
              />
            </div>
          ),
        },
        {
          id: "sales",
          label: `Sales history (${sales.length})`,
          content: (
            <div className="space-y-4">
              {salesSpark.length > 1 ? (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sale price over time
                  </div>
                  <SparkLine
                    points={salesSpark}
                    ariaLabel="Sale unit price over time"
                    stroke="#0ea5e9"
                    fill="rgba(14, 165, 233, 0.08)"
                  />
                </div>
              ) : null}
              <HistoryTable
                rows={sales.map((s) => ({
                  date: s.date,
                  partner: s.customerName,
                  ref: (
                    <Link
                      href={`/${locale}/sales/invoices/${s.docId}`}
                      className="text-primary hover:underline"
                    >
                      {s.docNumber}
                    </Link>
                  ),
                  qty: s.qty,
                  unitPrice: s.unitPrice,
                  total: s.total,
                }))}
              />
            </div>
          ),
        },
        {
          id: "vendors",
          label: `Vendors (${vendors.length})`,
          content: (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Last price</th>
                    <th className="px-4 py-3 text-right">POs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vendors.map((v) => (
                    <tr key={v.supplierId}>
                      <td className="px-4 py-3">{v.supplierName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{v.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{v.value.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{v.lastPrice.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{v.poCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "customers",
          label: `Customers (${customers.length})`,
          content: (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Last price</th>
                    <th className="px-4 py-3 text-right">Invoices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customers.map((c) => (
                    <tr key={c.customerId}>
                      <td className="px-4 py-3">{c.customerName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.value.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.lastPrice.toFixed(3)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.invoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "ai",
          label: "AI insights",
          content: (
            <div className="space-y-3">
              {aiCards.length === 0 ? (
                <div className="text-sm text-muted-foreground">No notable patterns right now.</div>
              ) : (
                aiCards.map((c, i) => (
                  <div
                    key={i}
                    className={
                      "rounded-md border p-3 text-sm " +
                      (c.tone === "warn"
                        ? "border-status-pending-border bg-status-pending-muted"
                        : c.tone === "critical"
                          ? "border-status-danger-border bg-status-danger-muted"
                          : "border-primary/30 bg-primary/10")
                    }
                  >
                    <div className="font-medium text-foreground">{c.title}</div>
                    <div className="mt-0.5 text-xs text-foreground">{c.rationale}</div>
                  </div>
                ))
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function HistoryTable({
  rows,
}: {
  rows: Array<{
    date: string;
    partner: string;
    ref: React.ReactNode;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Partner</th>
            <th className="px-4 py-3">Doc</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Unit</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                No history yet.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-3">{r.date}</td>
                <td className="px-4 py-3">{r.partner}</td>
                <td className="px-4 py-3">{r.ref}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.unitPrice.toFixed(3)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.total.toFixed(3)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function buildAiCards(
  snapshot: Awaited<ReturnType<typeof getItemSnapshot>>,
  lots: Awaited<ReturnType<typeof getItemLots>>,
): Array<{ tone: "info" | "warn" | "critical"; title: string; rationale: string }> {
  if (!snapshot) return [];
  const out: Array<{ tone: "info" | "warn" | "critical"; title: string; rationale: string }> = [];

  if (snapshot.onHand <= 10 && snapshot.openPoLines === 0) {
    out.push({
      tone: "warn",
      title: "Low on-hand, no open PO",
      rationale: `Only ${snapshot.onHand} ${snapshot.uom} on hand and nothing in transit. Consider a reorder.`,
    });
  }
  if (snapshot.openSoLines > 0 && snapshot.onHand < snapshot.openSoLines * 5) {
    out.push({
      tone: "warn",
      title: "Open SO lines may exceed available stock",
      rationale: `${snapshot.openSoLines} open SO line(s) for this SKU; ${snapshot.onHand} on hand. Confirm availability.`,
    });
  }
  if (lots.some((l) => l.totalOnHand > 0)) {
    const oldest = [...lots].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))[0];
    if (oldest && oldest.totalOnHand > 0) {
      out.push({
        tone: "info",
        title: "Oldest lot",
        rationale: `Lot ${oldest.lotNumber} first received ${oldest.firstSeen} — ${oldest.totalOnHand} ${snapshot.uom} on hand. Consider FEFO pick.`,
      });
    }
  }
  return out;
}
