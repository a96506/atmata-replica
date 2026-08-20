import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { getStockAdjustment } from "@/lib/api/inventory-tx";
import { listProducts, listWarehouses } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "posted", label: "Posted" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const adj = await getStockAdjustment(id);
  if (!adj) notFound();
  const [products, warehouses, related, history] = await Promise.all([
    listProducts(),
    listWarehouses(),
    relatedDocsFor("stock_adjustment", adj.id, locale),
    listAuditEvents("stock_adjustment", adj.id),
  ]);

  const linesTable = (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
          <tr>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">Warehouse</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3 text-right">Δqty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {adj.lines.map((l) => {
            const p = products.find((pp) => pp.id === l.productId);
            const w = warehouses.find((ww) => ww.id === l.warehouseId);
            return (
              <tr key={l.id}>
                <td className="px-4 py-3">{p ? `${p.sku} · ${p.name}` : "—"}</td>
                <td className="px-4 py-3">{w?.name ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-foreground">{l.reason}</td>
                <td
                  className={
                    "px-4 py-3 text-right tabular-nums " +
                    (l.qtyDelta < 0
                      ? "text-destructive"
                      : l.qtyDelta > 0
                        ? "text-status-success-foreground"
                        : "")
                  }
                >
                  {l.qtyDelta > 0 ? "+" : ""}
                  {l.qtyDelta}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <DocumentLayout
      number={adj.number}
      title={`Stock adjustment · ${adj.date}`}
      subtitle={`${adj.approvedBy ? `Approved by ${adj.approvedBy}` : ""}${adj.notes ? ` · ${adj.notes}` : ""}`}
      states={STATES}
      currentState={adj.state}
      actionBar={
        <DocActionBar
          locale={locale === "ar" ? "ar" : "en"}
          docType="stock_adjustment"
          docId={adj.id}
          expectedRowVersion={adj.rowVersion}
          docDate={adj.date}
          docNumber={adj.number}
          currentState={adj.state}
        />
      }
      tabs={[
        { id: "lines", label: "Lines", content: linesTable },
        {
          id: "history",
          label: "History",
          content: <HistoryTab events={history} />,
        },
        attachmentsTab("stock_adjustment", adj.id),
      ]}
      rightRail={<RelatedDocs groups={related} />}
      loadedAt={new Date().toISOString()}

    />
  );
}
