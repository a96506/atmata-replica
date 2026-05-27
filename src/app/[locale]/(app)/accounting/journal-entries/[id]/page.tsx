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

  const linesTable = (
    <div className="space-y-3">
      <div
        className={
          "rounded-md border p-3 text-sm " +
          (balanced
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-red-200 bg-red-50 text-red-900")
        }
      >
        <span className="font-medium">
          {balanced ? "Balanced" : "Unbalanced"}
        </span>{" "}
        · Dr {formatMoney(totalDr, je.currency)} · Cr{" "}
        {formatMoney(totalCr, je.currency)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-700 uppercase">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {je.lines.map((l) => {
              const acc = accounts.find((a) => a.id === l.accountId);
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-slate-500">
                      {acc?.code ?? "—"}
                    </span>{" "}
                    {acc?.name ?? l.accountId}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{l.description}</td>
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
          <tfoot className="border-t border-slate-200 bg-slate-50">
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
      subtitle={`Posted ${je.date} · source: ${je.sourceType} · ${je.sourceId}`}
      states={STATES}
      currentState={je.state}
      totals={
        <div>
          <div className="text-xs text-slate-500">Debit</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(totalDr, je.currency)}
          </div>
        </div>
      }
      actionBar={
        <DocActionBar
          docType="journal_entry"
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
        attachmentsTab(),
      ]}
      rightRail={<RelatedDocs groups={related} />}
      loadedAt={new Date().toISOString()}

    />
  );
}
