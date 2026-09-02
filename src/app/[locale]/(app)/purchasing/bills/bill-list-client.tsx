"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  SelectableDataTable,
  type ServerPagination,
} from "@/components/data-table-selectable";
import { StateBadge } from "@/components/doc/StateBadge";
import { BulkAdoptButton } from "@/components/doc/BulkAdoptButton";
import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import { formatMoney } from "@/lib/money";
import type { VendorBill } from "@/types";

export function BillListClient({
  locale,
  bills,
  exportBills,
  supplierNames,
  serverPagination,
}: {
  locale: string;
  /** Current server page rows (shown in the table). */
  bills: VendorBill[];
  /** Capped full list for CSV export (prior UX). */
  exportBills: VendorBill[];
  /** id → name for parties on this page and export rows. */
  supplierNames: Record<string, string>;
  serverPagination: ServerPagination;
}) {
  const t = useTranslations("purchasing");
  const supplierName = (id: string) => supplierNames[id] ?? "—";
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportCsvButton
          rows={exportBills}
          filename="vendor-bills"
          columns={[
            { label: "Number", value: (b) => b.number },
            { label: "Supplier", value: (b) => supplierName(b.supplierId) },
            { label: "Invoice number", value: (b) => b.invoiceNumber },
            { label: "PO ref", value: (b) => b.poId ?? "" },
            { label: "GRN ref", value: (b) => b.grnId ?? "" },
            { label: "Date", value: (b) => b.date },
            { label: "Due date", value: (b) => b.dueDate },
            { label: "Currency", value: (b) => b.currency },
            { label: "Subtotal", value: (b) => b.subtotal },
            { label: "Tax total", value: (b) => b.taxTotal },
            { label: "Total", value: (b) => b.total },
            { label: "Paid", value: (b) => b.paid },
            { label: "3-way match", value: (b) => b.threeWayMatch },
            { label: "State", value: (b) => b.state },
          ]}
        />
      </div>
      <SelectableDataTable
        columns={[
          { key: "number", label: "Number" },
          { key: "supplier", label: "Supplier" },
          { key: "po", label: "PO ref" },
          { key: "date", label: "Date" },
          { key: "total", label: "Total", className: "text-right" },
          { key: "match", label: "3-way" },
          { key: "state", label: "Status" },
        ]}
        rowIds={bills.map((b) => b.id)}
        rows={bills.map((b) => [
          <Link
            key="n"
            href={`/purchasing/bills/${b.id}`}
            className="font-medium text-primary hover:underline"
          >
            {b.number}
          </Link>,
          supplierName(b.supplierId),
          b.poId ? (
            <Link
              key="p"
              href={`/purchasing/purchase-orders/${b.poId}`}
              className="text-primary hover:underline"
            >
              {b.poId}
            </Link>
          ) : (
            "—"
          ),
          b.date,
          <span key="t" className="tabular-nums">
            {formatMoney(b.total, b.currency)}
          </span>,
          <StateBadge key="m" state={b.threeWayMatch} />,
          <StateBadge key="s" state={b.state} />,
        ])}
        emptyMessage={t("empty.bills")}
        serverPagination={serverPagination}
        renderBulkActions={(ids, clear) => {
          const first = bills.find((b) => b.id === ids[0]);
          if (!first || first.state !== "posted") {
            return (
              <span className="text-xs text-muted-foreground">
                Select posted bills to bulk-adopt into a payment.
              </span>
            );
          }
          return (
            <BulkAdoptButton
              parentType="vendor_bill"
              parentState={first.state}
              selectedIds={ids}
              currency={first.currency}
              locale={locale}
              onAfter={clear}
            />
          );
        }}
      />
    </div>
  );
}
