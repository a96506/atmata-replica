import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { listJournalEntries } from "@/lib/api/gl";
import { formatMoney } from "@/lib/money";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const entries = await listJournalEntries();

  return (
    <DocumentList
      title="Journal entries"
      subtitle="One JE per posted business document. Every Dr must equal Cr."
      primaryAction={
        <NewDocButton
          href={`/${locale}/accounting/journal-entries/new`}
          label="New JE"
        />
      }
    >
      <DataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "date", label: "Date" },
          { key: "desc", label: "Description" },
          { key: "source", label: "Source" },
          { key: "amount", label: "Amount", className: "text-right" },
          { key: "state", label: "Status" },
        ]}
        rows={entries.map((j) => {
          const total = j.lines.reduce((s, l) => s + l.debit, 0);
          return [
            <Link
              key="n"
              href={`/${locale}/accounting/journal-entries/${j.id}`}
              className="font-medium text-primary hover:underline"
            >
              {j.number}
            </Link>,
            j.date,
            <span key="d" className="text-foreground">
              {j.description}
            </span>,
            <span key="s" className="text-xs text-muted-foreground">
              {j.sourceType} · {j.sourceId}
            </span>,
            <span key="t" className="tabular-nums">
              {formatMoney(total, j.currency)}
            </span>,
            <StateBadge key="ss" state={j.state} />,
          ];
        })}
        emptyMessage="No journal entries yet."
      />
    </DocumentList>
  );
}
