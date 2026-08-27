"use client";

import Link from "next/link";
import { SelectableDataTable } from "@/components/data-table-selectable";
import { StateBadge } from "@/components/doc/StateBadge";
import { BulkAdoptButton } from "@/components/doc/BulkAdoptButton";
import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import { formatMoney } from "@/lib/money";
import type { Supplier, VendorBill } from "@/types";

export function BillListClient({
  locale,
  bills,
  suppliers,
}: {
  locale: string;
  bills: VendorBill[];
  suppliers: Supplier[];
}) {
  const supplierName = (id: string) =>
    suppliers.find((s) => s.id === id)?.name ?? "—";
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportCsvButton
          rows={bills}
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
      rows={bills.map((b) => {
        const sup = suppliers.find((s) => s.id === b.supplierId);
        return [
          <Link
            key="n"
            href={`/${locale}/purchasing/bills/${b.id}`}
            className="font-medium text-primary hover:underline"
          >
            {b.number}
          </Link>,
          sup?.name ?? "—",
          b.poId ? (
            <Link
              key="p"
              href={`/${locale}/purchasing/purchase-orders/${b.poId}`}
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
        ];
      })}
      emptyMessage="No vendor bills yet."
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
