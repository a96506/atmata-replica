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
import { getGoodsReceipt, getPurchaseOrder } from "@/lib/api/p2p";
import { getSupplier, getWarehouse, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption.server";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";

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
  const grn = await getGoodsReceipt(id);
  if (!grn) notFound();
  const [supplier, po, warehouse, taxCodes, related, history, ancestry, descendants, ai] =
    await Promise.all([
      getSupplier(grn.supplierId),
      getPurchaseOrder(grn.poId),
      getWarehouse(grn.warehouseId),
      listTaxCodes(),
      relatedDocsFor("grn", grn.id, locale),
      listAuditEvents("grn", grn.id),
      getAncestry("grn", grn.id),
      getDescendants("grn", grn.id),
      getAiSuggestions({ kind: "doc", docType: "grn", docId: grn.id }),
    ]);

  const totalQty = grn.lines.reduce((s, l) => s + l.qtyReceived, 0);

  return (
    <DocumentLayout
      number={grn.number}
      title={supplier?.name ?? "Unknown supplier"}
      subtitle={`Received ${grn.date} · ${warehouse?.name ?? ""} · against ${po?.number ?? "—"}`}
      states={STATES}
      currentState={grn.state}
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Qty received</div>
          <div className="text-lg font-semibold tabular-nums">{totalQty}</div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="grn"
          docNumber={grn.number}
          currentState={grn.state}
          totalLabel={`${totalQty} units`}
        />
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <DocLines
              lines={grn.lines.map((l) => ({
                id: l.id,
                description: l.description,
                qty: l.qtyReceived,
                unitPrice: l.unitPrice,
                taxCodeId: l.taxCodeId,
              }))}
              currency="KWD"
              taxCodes={taxCodes}
              qtyHeader="Received"
              extraColumn={{
                header: "PO line",
                render: (line) => {
                  const orig = grn.lines.find((g) => g.id === line.id);
                  return orig ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {orig.poLineId}
                    </span>
                  ) : null;
                },
              }}
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
        attachmentsTab("goods_receipt", grn.id),
      ]}
      rightRail={
        <div className="space-y-4">
          <AiCopilotRail
            locale={locale}
            scope={{ kind: "doc", docType: "grn", docId: grn.id }}
            suggestions={ai}
          />
          <AdoptToButton
            mode="single"
            parentType="grn"
            parentState={grn.state}
            parentId={grn.id}
            currency="KWD"
            locale={locale}
          />
          <CreateChildLinks
            links={[
              {
                label: "Bill",
                href: `/${locale}/purchasing/bills/new?from=${grn.poId}&fromGrn=${grn.id}`,
              },
            ]}
          />
          <RelatedDocs groups={related} />
        </div>
      }
      loadedAt={new Date().toISOString()}

    />
  );
}
