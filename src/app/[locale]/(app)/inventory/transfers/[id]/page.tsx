import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { getInternalTransfer } from "@/lib/api/inventory-tx";
import { getWarehouse, listProducts } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "posted", label: "Posted" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const trx = await getInternalTransfer(id);
  if (!trx) notFound();
  const [from, to, products, related, history] = await Promise.all([
    getWarehouse(trx.fromWarehouseId),
    getWarehouse(trx.toWarehouseId),
    listProducts(),
    relatedDocsFor("internal_transfer", trx.id, locale),
    listAuditEvents("internal_transfer", trx.id),
  ]);

  const linesTable = (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-700 uppercase">
          <tr>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3">Lot</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {trx.lines.map((l) => {
            const p = products.find((pp) => pp.id === l.productId);
            return (
              <tr key={l.id}>
                <td className="px-4 py-3">{p ? `${p.sku} · ${p.name}` : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.qty}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {l.lotNumber ?? "—"}
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
      number={trx.number}
      title={`${from?.name ?? "—"}  →  ${to?.name ?? "—"}`}
      subtitle={`Transfer ${trx.date}${trx.notes ? ` · ${trx.notes}` : ""}`}
      states={STATES}
      currentState={trx.state}
      actionBar={
        <DocActionBar
          docType="internal_transfer"
          docNumber={trx.number}
          currentState={trx.state}
        />
      }
      tabs={[
        { id: "lines", label: "Lines", content: linesTable },
        {
          id: "history",
          label: "History",
          content: <HistoryTab events={history} />,
        },
        attachmentsTab(),
      ]}
      rightRail={<RelatedDocs groups={related} />}
      loadedAt={new Date().toISOString()}

    />
  );
}
