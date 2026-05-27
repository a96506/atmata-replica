import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listWarehouses } from "@/lib/api/master";

export default async function Page() {
  const rows = await listWarehouses();
  return (
    <DocumentList title="Warehouses" subtitle="Physical storage locations.">
      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
        ]}
        rows={rows.map((w) => [w.code, w.name])}
      />
    </DocumentList>
  );
}
