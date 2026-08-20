import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listFxRates } from "@/lib/api/master";

export default async function Page() {
  const rates = await listFxRates();
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
        rows={rates
          .slice()
          .sort((a, b) => b.rateDate.localeCompare(a.rateDate))
          .map((r) => [
            r.rateDate,
            r.baseCurrency,
            r.quoteCurrency,
            Number(r.rate).toFixed(5),
          ])}
      />
    </DocumentList>
  );
}
