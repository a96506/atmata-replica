"use client";

import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import type { Customer } from "@/types";

/** Client island: CSV column accessors stay off the RSC boundary. */
export function CustomersExportClient({ rows }: { rows: Customer[] }) {
  return (
    <ExportCsvButton
      rows={rows}
      filename="customers"
      columns={[
        { label: "Name", value: (c) => c.name },
        { label: "VAT number", value: (c) => c.vatNumber ?? "" },
        { label: "Credit limit", value: (c) => c.creditLimit },
        { label: "Exposure", value: (c) => c.exposure },
        { label: "Payment status", value: (c) => c.paymentStatus },
        { label: "Credit score", value: (c) => c.creditScore },
      ]}
    />
  );
}
