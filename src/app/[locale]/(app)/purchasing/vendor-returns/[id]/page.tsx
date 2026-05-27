import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { DocLines } from "@/components/doc/DocLines";
import { getVendorReturn } from "@/lib/api/returns";
import { getSupplier, getWarehouse, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "posted", label: "Posted" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const vr = await getVendorReturn(id);
  if (!vr) notFound();
  const [supplier, warehouse, taxCodes, related, history, ancestry, descendants] =
    await Promise.all([
      getSupplier(vr.supplierId),
      getWarehouse(vr.warehouseId),
      listTaxCodes(),
      relatedDocsFor("vendor_return", vr.id, locale),
      listAuditEvents("vendor_return", vr.id),
      getAncestry("vendor_return", vr.id),
      getDescendants("vendor_return", vr.id),
    ]);

  const totalQty = vr.lines.reduce((s, l) => s + l.qty, 0);
  const totalValue = vr.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <DocumentLayout
      number={vr.number}
      title={supplier?.name ?? "Unknown supplier"}
      subtitle={`Returned ${vr.date} · ${warehouse?.name ?? ""} · against ${vr.grnId}${vr.notes ? ` · ${vr.notes}` : ""}`}
      states={STATES}
      currentState={vr.state}
      totals={
        <div>
          <div className="text-xs text-slate-500">Total returned</div>
          <div className="text-lg font-semibold tabular-nums">
            {totalQty} units · {totalValue.toFixed(3)} KWD
          </div>
        </div>
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <DocLines
              lines={vr.lines.map((l) => ({
                id: l.id,
                description: `${l.description} · reason: ${l.reasonCode}`,
                qty: l.qty,
                unitPrice: l.unitPrice,
                taxCodeId: l.taxCodeId,
              }))}
              currency="KWD"
              taxCodes={taxCodes}
              qtyHeader="Returned"
            />
          ),
        },
        {
          id: "adoption",
          label: "Adoption",
          content: (
            <AdoptionTrail locale={locale} ancestry={ancestry} descendants={descendants} />
          ),
        },
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
