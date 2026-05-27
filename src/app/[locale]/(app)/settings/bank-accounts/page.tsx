import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listBankAccounts, listCompanies } from "@/lib/api/master";

export default async function Page() {
  const [rows, companies] = await Promise.all([listBankAccounts(), listCompanies()]);
  return (
    <DocumentList title="Bank accounts" subtitle="Operating accounts per company.">
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "iban", label: "IBAN" },
          { key: "currency", label: "Currency" },
          { key: "company", label: "Company" },
        ]}
        rows={rows.map((b) => [
          b.name,
          b.iban,
          b.currency,
          companies.find((c) => c.id === b.companyId)?.name ?? b.companyId,
        ])}
      />
    </DocumentList>
  );
}
