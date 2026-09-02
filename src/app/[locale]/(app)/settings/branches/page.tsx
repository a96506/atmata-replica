import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listBranches, listCompanies } from "@/lib/api/master";

// DONE(role-ux): read-only by design — branches are provisioned with the company; no MasterCrud planned.

export default async function Page() {
  const [rows, companies] = await Promise.all([listBranches(), listCompanies()]);
  return (
    <DocumentList title="Branches" subtitle="Operating branches per company. Read-only by design.">
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
