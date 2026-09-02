"use client";

import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import type { CustomerInvoice } from "@/types";

/** Client island: CSV column accessors stay off the RSC boundary. */
export function InvoiceExportClient({
  rows,
  customerNames,
}: {
  rows: CustomerInvoice[];
  customerNames: Record<string, string>;
}) {
  const customerName = (id: string) => customerNames[id] ?? "—";
  return (
    <ExportCsvButton
      rows={rows}
      filename="customer-invoices"
      columns={[
        { label: "Number", value: (i) => i.number },
        { label: "Customer", value: (i) => customerName(i.customerId) },
        { label: "Date", value: (i) => i.date },
        { label: "Due date", value: (i) => i.dueDate },
        { label: "Currency", value: (i) => i.currency },
        { label: "Total", value: (i) => i.total },
        { label: "Paid", value: (i) => i.paid },
        { label: "Balance", value: (i) => i.total - i.paid },
        { label: "State", value: (i) => i.state },
      ]}
    />
  );
}
