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
      docNumber={adj.number}
      docTitle={`Adjustment ${adj.date}`}
      state={adj.state}
      date={adj.date}
      notes={adj.notes}
      linesPreview={
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {adj.lines.map((l) => {
            const p = products.find((pp) => pp.id === l.productId);
            const w = warehouses.find((ww) => ww.id === l.warehouseId);
            return (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{p ? `${p.sku} · ${p.name}` : "—"} @ {w?.name ?? "—"}</span>
                <span className={"tabular-nums " + (l.qtyDelta < 0 ? "text-red-700" : "text-emerald-700")}>
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
