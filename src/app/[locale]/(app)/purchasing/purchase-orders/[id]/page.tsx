import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocLines } from "@/components/doc/DocLines";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { CreateChildLinks } from "@/components/doc/CreateChildLinks";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { AdoptToButton } from "@/components/doc/AdoptToButton";
import { getPurchaseOrder, listGoodsReceipts, listVendorBills } from "@/lib/api/p2p";
import { getSupplier, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";
import { formatMoney } from "@/lib/money";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "posted", label: "Closed" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const [
    supplier,
    taxCodes,
    related,
    history,
    allGrns,
    allBills,
    ancestry,
    descendants,
    aiSuggestions,
  ] = await Promise.all([
    getSupplier(po.supplierId),
    listTaxCodes(),
    relatedDocsFor("po", po.id, locale),
    listAuditEvents("po", po.id),
    listGoodsReceipts(),
    listVendorBills(),
    getAncestry("po", po.id),
    getDescendants("po", po.id),
    getAiSuggestions({ kind: "doc", docType: "po", docId: po.id }),
  ]);

  // Inject qtyReceived / qtyInvoiced into each line for the mini-bar.
  const grnLinesForThisPo = allGrns
    .filter((g) => g.poId === po.id)
    .flatMap((g) => g.lines);
  const billLinesForThisPo = allBills
    .filter((b) => b.poId === po.id)
    .flatMap((b) => b.lines);
  const linesWithMirrors = po.lines.map((l) => ({
    ...l,
    qtyReceived: grnLinesForThisPo
      .filter((gl) => gl.poLineId === l.id)
      .reduce((s, gl) => s + gl.qtyReceived, 0),
    qtyInvoiced: billLinesForThisPo
      .filter((bl) => bl.poLineId === l.id)
      .reduce((s, bl) => s + bl.qty, 0),
  }));

  return (
    <DocumentLayout
      number={po.number}
      title={supplier?.name ?? "Unknown supplier"}
      subtitle={`PO date ${po.date} · expected ${po.expectedDate}`}
      states={STATES}
      currentState={po.state}
      totals={
        <div>
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(po.total, po.currency)}
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="po"
          docNumber={po.number}
          currentState={po.state}
          totalLabel={formatMoney(po.total, po.currency)}
        />
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <DocLines
              lines={linesWithMirrors}
              currency={po.currency}
              taxCodes={taxCodes}
              flowedKind="received"
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
      rightRail={
        <div className="space-y-4">
          <AiCopilotRail
            locale={locale}
            scope={{ kind: "doc", docType: "po", docId: po.id }}
            suggestions={aiSuggestions}
          />
          {po.state === "confirmed" || po.state === "posted" ? (
            <>
              <AdoptToButton
                mode="single"
                parentType="po"
                parentState={po.state}
                parentId={po.id}
                currency={po.currency}
                locale={locale}
              />
              <CreateChildLinks
                links={[
                  { label: "Receive (GRN)", href: `/${locale}/purchasing/goods-receipts/new?from=${po.id}` },
                  { label: "Bill", href: `/${locale}/purchasing/bills/new?from=${po.id}` },
                ]}
              />
            </>
          ) : null}
          <RelatedDocs groups={related} />
        </div>
      }
      loadedAt={new Date().toISOString()}

    />
  );
}
