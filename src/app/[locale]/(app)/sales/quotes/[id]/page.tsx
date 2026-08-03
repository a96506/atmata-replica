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
import { ExpiredQuoteBanner } from "@/components/banners";
import { getQuote } from "@/lib/api/q2c";
import { getCustomer, listTaxCodes } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";
import { formatMoney } from "@/lib/money";
import type { DocState } from "@/types";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "posted", label: "Sent" },
  { id: "confirmed", label: "Accepted" },
  { id: "expired", label: "Expired" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const q = await getQuote(id);
  if (!q) notFound();
  const [customer, taxCodes, related, history, ancestry, descendants, ai] = await Promise.all([
    getCustomer(q.customerId),
    listTaxCodes(),
    relatedDocsFor("quote", q.id, locale),
    listAuditEvents("quote", q.id),
    getAncestry("quote", q.id),
    getDescendants("quote", q.id),
    getAiSuggestions({ kind: "doc", docType: "quote", docId: q.id }),
  ]);

  const stateAlias = q.state === "accepted" ? "confirmed" : q.state;
  const isExpired =
    q.state === "expired" || new Date(q.validUntil) < new Date();

  return (
    <DocumentLayout
      number={q.number}
      title={customer?.name ?? "Unknown customer"}
      subtitle={`Issued ${q.date} · valid until ${q.validUntil}`}
      states={STATES}
      currentState={isExpired ? "expired" : stateAlias}
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(q.total, q.currency)}
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="quote"
          docNumber={q.number}
          currentState={stateAlias === "expired" ? "cancelled" : (stateAlias as "draft" | "pending" | "confirmed" | "posted" | "cancelled")}
          totalLabel={formatMoney(q.total, q.currency)}
          blockedReason={isExpired ? "Quote expired — re-issue to convert." : null}
        />
      }
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <div className="space-y-4">
              {isExpired ? <ExpiredQuoteBanner validUntil={q.validUntil} /> : null}
              <DocLines lines={q.lines} currency={q.currency} taxCodes={taxCodes} />
            </div>
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
            scope={{ kind: "doc", docType: "quote", docId: q.id }}
            suggestions={ai}
          />
          {!isExpired && q.state === "accepted" ? (
            <>
              <AdoptToButton
                mode="single"
                parentType="quote"
                parentState={q.state as DocState}
                parentId={q.id}
                currency={q.currency}
                locale={locale}
              />
              <CreateChildLinks
                links={[
                  {
                    label: "Convert to SO",
                    href: `/${locale}/sales/orders/new?from=${q.id}`,
                  },
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
