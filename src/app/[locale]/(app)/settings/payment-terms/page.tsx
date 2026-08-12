import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listPaymentTerms } from "@/lib/api/master";

export default async function Page() {
  const rows = await listPaymentTerms();
  return (
    <DocumentList title="Payment terms" subtitle="Net-days terms applied to POs, bills, and invoices.">
      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "nameEn", label: "Name (EN)" },
          { key: "nameAr", label: "Name (AR)" },
          { key: "net", label: "Net days" },
        ]}
        rows={rows.map((p) => [p.code, p.nameEn, p.nameAr, p.netDays])}
      />
    </DocumentList>
  );
}
