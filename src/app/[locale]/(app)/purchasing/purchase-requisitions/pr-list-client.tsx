"use client";

import Link from "next/link";
import { SelectableDataTable } from "@/components/data-table-selectable";
import { StateBadge } from "@/components/doc/StateBadge";
import { BulkAdoptButton } from "@/components/doc/BulkAdoptButton";
import type { DocState, PurchaseRequisition } from "@/types";

export function PrListClient({
  locale,
  prs,
}: {
  locale: string;
  prs: PurchaseRequisition[];
}) {
  // Group selectable rows by their state so bulk actions can compute legal
  // targets cleanly. The picker handles the rest.
  const eligibleState: DocState = "posted"; // most seeded PRs are posted
  return (
    <SelectableDataTable
      columns={[
        { key: "number", label: "Number" },
        { key: "by", label: "Requested by" },
        { key: "date", label: "Date" },
        { key: "needed", label: "Needed by" },
        { key: "lines", label: "Lines" },
        { key: "state", label: "Status" },
      ]}
      rowIds={prs.map((p) => p.id)}
      rows={prs.map((p) => [
        <Link
          key="n"
          href={`/${locale}/purchasing/purchase-requisitions/${p.id}`}
          className="font-medium text-orange-600 hover:underline"
        >
          {p.number}
        </Link>,
        p.requestedBy,
        p.date,
        p.neededBy,
        p.lines.length,
        <StateBadge key="s" state={p.state} />,
      ])}
      emptyMessage="No purchase requisitions yet."
      renderBulkActions={(ids, clear) => (
        <BulkAdoptButton
          parentType="pr"
          parentState={eligibleState}
          selectedIds={ids}
          currency="KWD"
          locale={locale}
          onAfter={clear}
        />
      )}
    />
  );
}
