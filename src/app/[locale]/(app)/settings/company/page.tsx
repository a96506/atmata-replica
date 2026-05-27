import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listCompanies } from "@/lib/api/master";

export default async function Page() {
  const rows = await listCompanies();
  return (
    <DocumentList title="Companies" subtitle="Tenants in this Atmata workspace.">
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "profile", label: "Tax profile" },
          { key: "currency", label: "Base currency" },
          { key: "vat", label: "VAT number" },
        ]}
        rows={rows.map((c) => [c.name, c.taxProfile, c.baseCurrency, c.vatNumber])}
      />
    </DocumentList>
  );
}
