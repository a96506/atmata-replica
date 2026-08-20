import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { getStockAdjustment } from "@/lib/api/inventory-tx";
import { listProducts, listWarehouses } from "@/lib/api/master";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const adj = await getStockAdjustment(id);
  if (!adj) notFound();
  const [products, warehouses] = await Promise.all([listProducts(), listWarehouses()]);
  return (
    <DocEditShell
      locale={locale === "ar" ? "ar" : "en"}
      docType="stock_adjustment"
      docId={adj.id}
      expectedRowVersion={adj.rowVersion}
      docNumber={adj.number}
      docTitle={`Adjustment ${adj.date}`}
      state={adj.state}
      date={adj.date}
      notes={adj.notes ?? undefined}
      linesPreview={
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {adj.lines.map((l) => {
            const p = products.find((pp) => pp.id === l.productId);
            const w = warehouses.find((ww) => ww.id === l.warehouseId);
            return (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{p ? `${p.sku} · ${p.name}` : "—"} @ {w?.name ?? "—"}</span>
                <span className={"tabular-nums " + (l.qtyDelta < 0 ? "text-destructive" : "text-status-success-foreground")}>
                  {l.qtyDelta > 0 ? "+" : ""}{l.qtyDelta} · {l.reason}
                </span>
              </li>
            );
          })}
        </ul>
      }
      backHref={`/${locale}/inventory/adjustments/${adj.id}`}
    />
  );
}
