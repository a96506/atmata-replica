import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";

const PRICE_LISTS = [
  { id: "pl_default", name: "Default sale price list", currency: "KWD", customers: "All", validFrom: "2026-01-01", validUntil: "—" },
  { id: "pl_alpha", name: "Project Alpha annual supply", currency: "KWD", customers: "Project Alpha JV", validFrom: "2026-04-15", validUntil: "2027-04-14" },
];

export default async function Page() {
  return (
    <DocumentList
      title="Price lists"
      subtitle="Customer-specific or default pricing. Each line on a quote/SO resolves the active list at line-add time."
    >
      <DataTable
        columns={[
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "currency", label: "Currency" },
          { key: "customers", label: "Scope" },
          { key: "from", label: "Valid from" },
          { key: "until", label: "Valid until" },
        ]}
        rows={PRICE_LISTS.map((p) => [p.id, p.name, p.currency, p.customers, p.validFrom, p.validUntil])}
      />
    </DocumentList>
  );
}
