import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listTaxCodes } from "@/lib/api/master";

export default async function Page() {
  const rows = await listTaxCodes();
  return (
    <DocumentList
      title="Tax codes"
      subtitle="KW / SA / AE jurisdictions. Each code carries an EN + AR name and a rate."
    >
      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "jur", label: "Jurisdiction" },
          { key: "nameEn", label: "Name (EN)" },
          { key: "nameAr", label: "Name (AR)" },
          { key: "rate", label: "Rate" },
          { key: "in", label: "Input?" },
          { key: "out", label: "Output?" },
        ]}
        rows={rows.map((t) => [
          t.code,
          t.jurisdiction,
          t.nameEn,
          t.nameAr,
          `${(t.rate * 100).toFixed(0)}%`,
          t.isInput ? "yes" : "no",
          t.isOutput ? "yes" : "no",
        ])}
      />
    </DocumentList>
  );
}
