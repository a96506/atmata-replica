import Link from "next/link";
import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { StateBadge } from "@/components/doc/StateBadge";
import { NewDocButton } from "@/components/doc/CreateChildLinks";
import { JeExportClient } from "./je-export-client";
import {
  ListStateFilter,
  normalizeListState,
} from "@/components/list/ListStateFilter";
import { listJournalEntriesPage } from "@/lib/api/gl";
import { parseListPage } from "@/lib/list-paging";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "journal_entries");

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string; page?: string; limit?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const { page, limit, offset } = parseListPage(sp);
  const stateFilter = normalizeListState(sp.state);
  const { items: entries, total } = await listJournalEntriesPage({
    limit,
    offset,
    state: stateFilter,
  });

  return (
    <DocumentList
      title="Journal entries"
      subtitle="One JE per posted business document. Every Dr must equal Cr."
      primaryAction={
        <div className="flex flex-wrap items-center gap-2">
          <ListStateFilter current={stateFilter} />
          <JeExportClient rows={entries} />
          <NewDocButton
            href={`/${locale}/accounting/journal-entries/new`}
            label="New JE"
            operation="create_journal_entry"
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
          const totalAmt = j.lines.reduce((s, l) => s + l.debit, 0);
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
              {formatMoney(totalAmt, j.currency)}
            </span>,
            <StateBadge key="ss" state={j.state} />,
          ];
        })}
        emptyMessage="No journal entries yet."
        serverPagination={{ page, pageSize: limit, total }}
      />
    </DocumentList>
  );
}
