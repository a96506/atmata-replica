import { notFound } from "next/navigation";
import Link from "next/link";
import { DocumentLayout } from "@/components/doc/DocumentLayout";
import { RelatedDocs } from "@/components/doc/RelatedDocs";
import { HistoryTab } from "@/components/doc/HistoryTab";
import { attachmentsTab } from "@/components/doc/docAttachmentsTab";
import { AdoptionTrail } from "@/components/doc/AdoptionTrail";
import { getRfq } from "@/lib/api/rfq";
import { listSuppliers } from "@/lib/api/master";
import { relatedDocsFor } from "@/lib/api/links";
import { listAuditEvents } from "@/lib/api/audit";
import { getAncestry, getDescendants } from "@/lib/api/adoption";
import { getAiSuggestions } from "@/lib/api/ai";
import { AiCopilotRail } from "@/components/ai/AiCopilotRail";

const STATES = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "quotes_received", label: "Quotes received" },
  { id: "awarded", label: "Awarded" },
  { id: "closed", label: "Closed" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const rfq = await getRfq(id);
  if (!rfq) notFound();
  const [suppliers, related, history, ancestry, descendants, ai] = await Promise.all([
    listSuppliers(),
    relatedDocsFor("rfq", rfq.id, locale),
    listAuditEvents("rfq", rfq.id),
    getAncestry("rfq", rfq.id),
    getDescendants("rfq", rfq.id),
    getAiSuggestions({ kind: "doc", docType: "rfq", docId: rfq.id }),
  ]);

  const awardedQuoteId = rfq.award?.quoteId;

  return (
    <DocumentLayout
      number={rfq.number}
      title={`RFQ to ${rfq.invitedVendorIds.length} vendors`}
      subtitle={`Issued ${rfq.date} · Quotes by ${rfq.expectedQuoteBy}${rfq.notes ? ` · ${rfq.notes}` : ""}`}
      states={STATES}
      currentState={rfq.state}
      tabs={[
        {
          id: "lines",
          label: "Lines",
          content: (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">From PR line(s)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rfq.lines.map((l, i) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-3">{l.description}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{l.qty}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {l.prLineIds?.join(", ") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          id: "compare",
          label: `Compare quotes (${rfq.quotes.length})`,
          content: (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Line</th>
                    {rfq.quotes.map((q) => {
                      const sup = suppliers.find((s) => s.id === q.vendorId);
                      return (
                        <th
                          key={q.id}
                          className={
                            "px-4 py-3 text-center " +
                            (q.id === awardedQuoteId ? "bg-emerald-50 text-emerald-900" : "")
                          }
                        >
                          <div>{sup?.name ?? q.vendorId}</div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {q.currency} · {q.lineQuotes[0]?.leadTimeDays ?? "?"}d
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rfq.lines.map((line) => {
                    // Find lowest unit price across vendors for this line.
                    const prices = rfq.quotes
                      .map((q) => q.lineQuotes.find((lq) => lq.rfqLineId === line.id)?.unitPrice)
                      .filter((p): p is number => p !== undefined);
                    const lowest = prices.length ? Math.min(...prices) : null;
                    return (
                      <tr key={line.id}>
                        <td className="px-4 py-3">{line.description}</td>
                        {rfq.quotes.map((q) => {
                          const lq = q.lineQuotes.find((x) => x.rfqLineId === line.id);
                          if (!lq) return <td key={q.id} className="px-4 py-3 text-center text-slate-400">—</td>;
                          const isLowest = lowest !== null && lq.unitPrice === lowest;
                          return (
                            <td
                              key={q.id}
                              className={
                                "px-4 py-3 text-center tabular-nums " +
                                (q.id === awardedQuoteId
                                  ? "bg-emerald-50 font-semibold text-emerald-900"
                                  : isLowest
                                    ? "text-emerald-700"
                                    : "")
                              }
                            >
                              {lq.unitPrice.toFixed(3)}
                              {isLowest && q.id !== awardedQuoteId ? (
                                <div className="text-[10px] font-normal text-emerald-600">lowest</div>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-4 py-3 text-right font-medium text-slate-700">Total</td>
                    {rfq.quotes.map((q) => (
                      <td
                        key={q.id}
                        className={
                          "px-4 py-3 text-center font-semibold tabular-nums " +
                          (q.id === awardedQuoteId ? "bg-emerald-100 text-emerald-900" : "")
                        }
                      >
                        {q.total.toFixed(3)} {q.currency}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
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
            scope={{ kind: "doc", docType: "rfq", docId: rfq.id }}
            suggestions={ai}
          />
          {rfq.award?.poId ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                Awarded
              </div>
              <Link
                href={`/${locale}/purchasing/purchase-orders/${rfq.award.poId}`}
                className="mt-1 inline-block font-medium text-emerald-900 hover:underline"
              >
                See PO →
              </Link>
            </div>
          ) : null}
          <RelatedDocs groups={related} />
        </div>
      }
      loadedAt={new Date().toISOString()}

    />
  );
}
