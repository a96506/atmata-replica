"use client";

import Link from "next/link";
import { SelectableDataTable } from "@/components/data-table-selectable";
import { StateBadge } from "@/components/doc/StateBadge";
import { BulkAdoptButton } from "@/components/doc/BulkAdoptButton";
import { formatMoney } from "@/lib/money";
import type { PurchaseOrder, Supplier } from "@/types";

export function PoListClient({
  locale,
  pos,
  suppliers,
}: {
  locale: string;
  pos: PurchaseOrder[];
  suppliers: Supplier[];
}) {
  // Filter to adoptable rows (confirmed or posted) — others are still
  // selectable but bulk actions will resolve no legal targets.
  return (
    <SelectableDataTable
      columns={[
        { key: "number", label: "Number" },
        { key: "supplier", label: "Supplier" },
        { key: "date", label: "Date" },
        { key: "total", label: "Total", className: "text-right" },
        { key: "state", label: "Status" },
      ]}
      rowIds={pos.map((p) => p.id)}
      rows={pos.map((po) => {
        const sup = suppliers.find((s) => s.id === po.supplierId);
        return [
          <Link
            key="n"
            href={`/${locale}/purchasing/purchase-orders/${po.id}`}
            className="font-medium text-primary hover:underline"
          >
            {po.number}
          </Link>,
          sup?.name ?? "—",
          po.date,
          <span key="t" className="tabular-nums">
            {formatMoney(po.total, po.currency)}
          </span>,
          <StateBadge key="s" state={po.state} />,
        ];
      })}
      emptyMessage={<bdi>No purchase orders yet.</bdi>}
      renderBulkActions={(ids, clear) => {
        // Use the first selected row's state as the gating state.
        const first = pos.find((p) => p.id === ids[0]);
        if (!first || (first.state !== "confirmed" && first.state !== "posted")) {
          return (
            <span className="text-xs text-muted-foreground">
              Select confirmed or posted POs to bulk-adopt.
            </span>
          );
        }
        return (
          <BulkAdoptButton
            parentType="po"
            parentState={first.state}
            selectedIds={ids}
            currency={first.currency}
            locale={locale}
            onAfter={clear}
          />
        );
      }}
    />
  );
}
