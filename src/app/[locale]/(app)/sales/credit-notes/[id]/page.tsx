import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { getCreditNote } from "@/lib/api/returns";
import { getCustomer } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption.server";
import { formatMoney } from "@/lib/money";

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
  const cn = await getCreditNote(id);
  if (!cn) notFound();
  const [customer, related, history, ancestry, descendants] = await Promise.all([
    getCustomer(cn.customerId),
    relatedDocsFor("credit_note", cn.id, locale),
    listAuditEvents("credit_note", cn.id),
    getAncestry("credit_note", cn.id),
    getDescendants("credit_note", cn.id),
  ]);

  const balance = Math.max(0, cn.total - cn.applied);

  return (
    <DocumentLayout
      number={cn.number}
      title={customer?.name ?? "Unknown customer"}
      subtitle={`Issued ${cn.date} · against return ${cn.customerReturnId}${cn.invoiceId ? ` · applied to ${cn.invoiceId}` : ""}`}
      states={STATES}
      currentState={cn.state}
      actionBar={
        <DocActionBar
          locale={locale === "ar" ? "ar" : "en"}
          docType="credit_note"
          docId={cn.id}
          expectedRowVersion={cn.rowVersion}
          docDate={cn.date}
          docNumber={cn.number}
          currentState={cn.state}
          totalLabel={formatMoney(cn.total, cn.currency)}
        />
      }
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(balance, cn.currency)}
          </div>
          <div className="text-xs text-muted-foreground">of {formatMoney(cn.total, cn.currency)}</div>
        </div>
      }
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: (
            <div className="space-y-2 text-sm">
              <Row k="Subtotal" v={formatMoney(cn.subtotal, cn.currency)} />
              <Row k="Tax" v={formatMoney(cn.taxTotal, cn.currency)} />
              <Row k="Total" v={formatMoney(cn.total, cn.currency)} bold />
              <Row k="Applied" v={formatMoney(cn.applied, cn.currency)} />
              <Row k="Balance" v={formatMoney(balance, cn.currency)} bold />
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
        attachmentsTab("credit_note", cn.id),
      ]}
      rightRail={<RelatedDocs groups={related} />}
      loadedAt={new Date().toISOString()}
    />
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-medium text-foreground" : "text-muted-foreground"}>{k}</span>
      <span className={"tabular-nums " + (bold ? "font-semibold" : "")}>{v}</span>
    </div>
  );
}
