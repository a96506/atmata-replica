import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { AdoptToButton } from "@/components/doc/AdoptToButton";
import { DocLines } from "@/components/doc/DocLines";
import { getPurchaseRequisition } from "@/lib/api/p2p";
import { listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Approved" },
  { id: "posted", label: "Posted" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const pr = await getPurchaseRequisition(id);
  if (!pr) notFound();
  const [taxCodes, related, history, ancestry, descendants, ai] = await Promise.all([
    listTaxCodes(),
    relatedDocsFor("pr", pr.id, locale),
    listAuditEvents("pr", pr.id),
    getAncestry("pr", pr.id),
    getDescendants("pr", pr.id),
    getAiSuggestions({ kind: "doc", docType: "pr", docId: pr.id }),
  ]);

  return (
    <DocumentLayout
      number={pr.number}
      title={`Requested by ${pr.requestedBy}`}
      subtitle={`Date ${pr.date} · needed by ${pr.neededBy}${pr.notes ? ` · ${pr.notes}` : ""}`}
      states={STATES}
      currentState={pr.state}
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <DocLines lines={pr.lines} currency="KWD" taxCodes={taxCodes} />
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
        attachmentsTab("purchase_requisition", pr.id),
      ]}
      rightRail={
        <div className="space-y-4">
          <AiCopilotRail
            locale={locale}
            scope={{ kind: "doc", docType: "pr", docId: pr.id }}
            suggestions={ai}
          />
          <AdoptToButton
            mode="single"
            parentType="pr"
            parentState={pr.state}
            parentId={pr.id}
            currency="KWD"
            locale={locale}
          />
          <RelatedDocs groups={related} />
        </div>
      }
      loadedAt={new Date().toISOString()}

    />
  );
}
