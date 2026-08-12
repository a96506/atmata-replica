import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { getDebitNote } from "@/lib/api/returns";
import { getSupplier } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption";
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
  const dn = await getDebitNote(id);
  if (!dn) notFound();
  const [supplier, related, history, ancestry, descendants] = await Promise.all([
    getSupplier(dn.supplierId),
    relatedDocsFor("debit_note", dn.id, locale),
    listAuditEvents("debit_note", dn.id),
    getAncestry("debit_note", dn.id),
    getDescendants("debit_note", dn.id),
  ]);

  const balance = Math.max(0, dn.total - dn.settled);

  return (
    <DocumentLayout
      number={dn.number}
      title={supplier?.name ?? "Unknown supplier"}
      subtitle={`Issued ${dn.date} · against return ${dn.vendorReturnId}${dn.billId ? ` · applied to ${dn.billId}` : ""}`}
      states={STATES}
      currentState={dn.state}
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(balance, dn.currency)}
          </div>
          <div className="text-xs text-muted-foreground">of {formatMoney(dn.total, dn.currency)}</div>
        </div>
      }
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: (
            <div className="space-y-2 text-sm">
              <Row k="Subtotal" v={formatMoney(dn.subtotal, dn.currency)} />
              <Row k="Tax" v={formatMoney(dn.taxTotal, dn.currency)} />
              <Row k="Total" v={formatMoney(dn.total, dn.currency)} bold />
              <Row k="Settled" v={formatMoney(dn.settled, dn.currency)} />
              <Row k="Balance" v={formatMoney(balance, dn.currency)} bold />
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
        attachmentsTab("debit_note", dn.id),
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
