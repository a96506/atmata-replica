"use client";

import Link from "next/link";
import {
  SelectableDataTable,
  type ServerPagination,
} from "@/components/data-table-selectable";
import { StateBadge } from "@/components/doc/StateBadge";
import { BulkAdoptButton } from "@/components/doc/BulkAdoptButton";
import { formatMoney } from "@/lib/money";
import type { PurchaseOrder } from "@/types";

export function PoListClient({
  locale,
  pos,
  supplierNames,
  serverPagination,
}: {
  locale: string;
  pos: PurchaseOrder[];
  /** id → name for suppliers on this page. */
  supplierNames: Record<string, string>;
  serverPagination: ServerPagination;
}) {
  const supplierName = (id: string) => supplierNames[id] ?? "—";

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
      rows={pos.map((po) => [
        <Link
          key="n"
          href={`/${locale}/purchasing/purchase-orders/${po.id}`}
          className="font-medium text-primary hover:underline"
        >
          {po.number}
        </Link>,
        supplierName(po.supplierId),
        po.date,
        <span key="t" className="tabular-nums">
          {formatMoney(po.total, po.currency)}
        </span>,
        <StateBadge key="s" state={po.state} />,
      ])}
      emptyMessage={<bdi>No purchase orders yet.</bdi>}
      serverPagination={serverPagination}
      renderBulkActions={(ids, clear) => {
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
