import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import {
  ListStateFilter,
  normalizeListState,
} from "@/components/list/ListStateFilter";
import { listJournalEntries } from "@/lib/api/gl";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "journal_entries");

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const { locale } = await params;
  const { state: stateParam } = await searchParams;
  const all = await listJournalEntries();
  const stateFilter = normalizeListState(stateParam);
  const entries = stateFilter ? all.filter((j) => j.state === stateFilter) : all;

  return (
    <DocumentList
      title="Journal entries"
      subtitle="One JE per posted business document. Every Dr must equal Cr."
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <ListStateFilter current={stateFilter} />
          <ExportCsvButton
            rows={entries}
            filename="journal-entries"
            columns={[
              { label: "Number", value: (j) => j.number },
              { label: "Date", value: (j) => j.date },
              { label: "Description", value: (j) => j.description },
              { label: "Source type", value: (j) => j.sourceType },
              { label: "Source id", value: (j) => j.sourceId },
              {
                label: "Amount",
                value: (j) => j.lines.reduce((s, l) => s + l.debit, 0),
              },
              { label: "Currency", value: (j) => j.currency },
              { label: "State", value: (j) => j.state },
            ]}
          />
          <NewDocButton
            href={`/${locale}/accounting/journal-entries/new`}
            label="New JE"
          />
        </div>
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
