import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { DocLines } from "@/components/doc/DocLines";
import { getCustomerReturn } from "@/lib/api/returns";
import { getCustomer, getWarehouse, listTaxCodes } from "@/lib/api/master";
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
  const cr = await getCustomerReturn(id);
  if (!cr) notFound();
  const [customer, warehouse, taxCodes, related, history, ancestry, descendants] =
    await Promise.all([
      getCustomer(cr.customerId),
      getWarehouse(cr.warehouseId),
      listTaxCodes(),
      relatedDocsFor("customer_return", cr.id, locale),
      listAuditEvents("customer_return", cr.id),
      getAncestry("customer_return", cr.id),
      getDescendants("customer_return", cr.id),
    ]);

  const totalQty = cr.lines.reduce((s, l) => s + l.qty, 0);
  const totalValue = cr.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <DocumentLayout
      number={cr.number}
      title={customer?.name ?? "Unknown customer"}
      subtitle={`Returned ${cr.date} · ${warehouse?.name ?? ""} · against ${cr.dnId}${cr.notes ? ` · ${cr.notes}` : ""}`}
      states={STATES}
      currentState={cr.state}
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
              lines={cr.lines.map((l) => ({
                id: l.id,
                description: `${l.description} · reason: ${l.reasonCode}${l.lotNumber ? ` · lot ${l.lotNumber}` : ""}`,
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
