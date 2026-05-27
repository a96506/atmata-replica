import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listBranches, listCompanies } from "@/lib/api/master";

export default async function Page() {
  const [rows, companies] = await Promise.all([listBranches(), listCompanies()]);
  return (
    <DocumentList title="Branches" subtitle="Operating branches per company.">
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "company", label: "Company" },
        ]}
        rows={rows.map((b) => [
          b.name,
          companies.find((c) => c.id === b.companyId)?.name ?? b.companyId,
        ])}
      />
    </DocumentList>
  );
}
