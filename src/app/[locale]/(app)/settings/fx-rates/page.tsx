import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { FX_RATES } from "@/mocks/seed/fx";

export default async function Page() {
  return (
    <DocumentList
      title="FX rates"
      subtitle="Daily cross-rates used on multi-currency documents. Most-recent rate wins."
    >
      <DataTable
        columns={[
          { key: "date", label: "Date" },
          { key: "from", label: "From" },
          { key: "to", label: "To" },
          { key: "rate", label: "Rate" },
        ]}
        rows={FX_RATES.slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((r) => [r.date, r.from, r.to, r.rate.toFixed(5)])}
      />
    </DocumentList>
  );
}
