import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { listApprovalRules } from "@/lib/api/master";

export default async function Page() {
  const rules = await listApprovalRules();
  return (
    <DocumentList
      title="Approval rules"
      subtitle="Doc type × min amount → approver chain. Used by the approval-route preview on every submit."
    >
      <DataTable
        columns={[
          { key: "doc", label: "Doc type" },
          { key: "min", label: "Min amount" },
          { key: "roles", label: "Approver roles" },
          { key: "seq", label: "Sequence" },
        ]}
        rows={rules.map((r) => [
          r.docType,
          Number(r.minAmount).toLocaleString(),
          (r.approverRoles ?? []).join(", "),
          String(r.sequence),
        ])}
      />
    </DocumentList>
  );
}
