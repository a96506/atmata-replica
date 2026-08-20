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
import { getDeliveryNote, getSalesOrder } from "@/lib/api/q2c";
import { getCustomer, getWarehouse, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption.server";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";
import { DocPdfActions } from "@/components/doc/DocPdfActions";

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
  const dn = await getDeliveryNote(id);
  if (!dn) notFound();
  const [customer, so, warehouse, taxCodes, related, history, ancestry, descendants, ai] =
    await Promise.all([
      getCustomer(dn.customerId),
      getSalesOrder(dn.soId),
      getWarehouse(dn.warehouseId),
      listTaxCodes(),
      relatedDocsFor("dn", dn.id, locale),
      listAuditEvents("dn", dn.id),
      getAncestry("dn", dn.id),
      getDescendants("dn", dn.id),
      getAiSuggestions({ kind: "doc", docType: "dn", docId: dn.id }, locale === "ar" ? "ar" : "en"),
    ]);

  const totalQty = dn.lines.reduce((s, l) => s + l.qtyDelivered, 0);

  return (
    <DocumentLayout
      number={dn.number}
      title={customer?.name ?? "Unknown customer"}
      subtitle={`Shipped ${dn.date} · ${warehouse?.name ?? ""} · against ${so?.number ?? "—"}`}
      states={STATES}
      currentState={dn.state}
      actions={<DocPdfActions docType="delivery" docId={dn.id} locale={locale} />}
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Qty shipped</div>
          <div className="text-lg font-semibold tabular-nums">{totalQty}</div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="dn"
          docNumber={dn.number}
          currentState={dn.state}
          totalLabel={`${totalQty} units`}
        />
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <DocLines
              lines={dn.lines.map((l) => ({
                id: l.id,
                description: l.description,
                qty: l.qtyDelivered,
                unitPrice: l.unitPrice,
                taxCodeId: l.taxCodeId,
              }))}
              currency="KWD"
              taxCodes={taxCodes}
              qtyHeader="Shipped"
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
        attachmentsTab("delivery_note", dn.id),
      ]}
      rightRail={
        <div className="space-y-4">
          <AiCopilotRail
            locale={locale}
            scope={{ kind: "doc", docType: "dn", docId: dn.id }}
            suggestions={ai}
          />
          <AdoptToButton
            mode="single"
            parentType="dn"
            parentState={dn.state}
            parentId={dn.id}
            currency="KWD"
            locale={locale}
          />
          <CreateChildLinks
            links={[
              {
                label: "Invoice",
                href: `/${locale}/sales/invoices/new?fromDn=${dn.id}`,
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
