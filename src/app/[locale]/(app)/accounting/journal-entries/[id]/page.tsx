import { notFound } from "next/navigation";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { DocActionBar } from "@/components/doc/DocActionBar";
import { getJournalEntry, listAccounts } from "@/lib/api/gl";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { formatMoney } from "@/lib/money";
import type { DocState } from "@/types";

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
  const je = await getJournalEntry(id);
  if (!je) notFound();
  const [accounts, related, history] = await Promise.all([
    listAccounts(),
    relatedDocsFor("journal_entry", je.id, locale),
    listAuditEvents("journal_entry", je.id),
  ]);

  const totalDr = je.lines.reduce((s, l) => s + l.debit, 0);
  const totalCr = je.lines.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.001;

  // Only show a "Posted" date once the JE is actually posted/locked/archived —
  // drafts render no posted date even though `je.date` exists.
  const POSTED_STATES: DocState[] = ["posted", "locked", "archived"];
  const showPostedDate = POSTED_STATES.includes(je.state);
  const hasSource = je.sourceType != null && je.sourceId != null;
  const subtitleParts: string[] = [];
  if (showPostedDate) subtitleParts.push(`Posted ${je.date}`);
  if (hasSource) subtitleParts.push(`source: ${je.sourceType} · ${je.sourceId}`);
  const subtitle = subtitleParts.join(" · ");

  const linesTable = (
    <div className="space-y-3">
      <div
        className={
          "rounded-md border p-3 text-sm " +
          (balanced
            ? "border-status-success-border bg-status-success-muted text-status-success-foreground"
            : "border-status-danger-border bg-status-danger-muted text-destructive")
        }
      >
        <span className="font-medium">
          {balanced ? "Balanced" : "Unbalanced"}
        </span>{" "}
        · Dr {formatMoney(totalDr, je.currency)} · Cr{" "}
        {formatMoney(totalCr, je.currency)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {je.lines.map((l) => {
              const acc = accounts.find((a) => a.id === l.accountId);
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {acc?.code ?? "—"}
                    </span>{" "}
                    {acc?.name ?? l.accountId}
                  </td>
                  <td className="px-4 py-3 text-foreground">{l.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.debit ? formatMoney(l.debit, je.currency) : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.credit ? formatMoney(l.credit, je.currency) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/50">
            <tr>
              <td colSpan={2} className="px-4 py-2 text-right font-medium">
                Totals
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {formatMoney(totalDr, je.currency)}
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {formatMoney(totalCr, je.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  return (
    <DocumentLayout
      number={je.number}
      title={je.description}
      subtitle={subtitle || undefined}
      states={STATES}
      currentState={je.state}
      totals={
        <div>
          <div className="text-xs text-muted-foreground">Debit</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(totalDr, je.currency)}
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          locale={locale === "ar" ? "ar" : "en"}
          docType="journal_entry"
          docId={je.id}
          expectedRowVersion={je.rowVersion}
          docDate={je.date}
          docNumber={je.number}
          currentState={je.state}
          totalLabel={formatMoney(totalDr, je.currency)}
          blockedReason={!balanced ? "Journal entry unbalanced — debits ≠ credits." : null}
        />
      }
      tabs={[
        { id: "lines", label: "Lines", content: linesTable },
        {
          id: "history",
          label: "History",
          content: <HistoryTab events={history} />,
        },
        attachmentsTab("journal_entry", je.id),
      ]}
      rightRail={<RelatedDocs groups={related} />}
      loadedAt={new Date().toISOString()}

    />
  );
}
