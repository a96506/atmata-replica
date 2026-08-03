import { notFound } from "next/navigation";
import { DocEditShell } from "@/components/doc/DocEditShell";
import { getJournalEntry, listAccounts } from "@/lib/api/gl";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const je = await getJournalEntry(id);
  if (!je) notFound();
  const accounts = await listAccounts();
  return (
    <DocEditShell
      docNumber={je.number}
      docTitle={je.description}
      state={je.state}
      date={je.date}
      linesPreview={
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
          </table>
        </div>
      }
      backHref={`/${locale}/accounting/journal-entries/${je.id}`}
    />
  );
}
