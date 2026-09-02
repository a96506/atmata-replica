"use client";

import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import type { Supplier } from "@/types";

/** Client island: CSV column accessors stay off the RSC boundary. */
export function SuppliersExportClient({ rows }: { rows: Supplier[] }) {
  return (
    <ExportCsvButton
      rows={rows}
      filename="suppliers"
      columns={[
        { label: "Name", value: (s) => s.name },
        { label: "VAT number", value: (s) => s.vatNumber ?? "" },
        { label: "Bank account", value: (s) => s.bankAccount ?? "" },
        { label: "Payment term id", value: (s) => s.paymentTermId ?? "" },
        { label: "WHT applicable", value: (s) => s.whtApplicable ?? false },
        { label: "WHT rate", value: (s) => s.whtRate ?? "" },
      ]}
    />
  );
}
