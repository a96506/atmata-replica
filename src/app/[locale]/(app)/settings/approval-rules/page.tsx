import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";
import { APPROVAL_RULES } from "@/mocks/seed/approvals";

export default async function Page() {
  return (
    <DocumentList
      title="Approval rules"
      subtitle="Doc type × min amount → approver chain. Used by the approval-route preview on every submit."
    >
      <DataTable
        columns={[
          { key: "doc", label: "Doc type" },
          { key: "min", label: "Min amount" },
          { key: "approver", label: "Approver" },
          { key: "role", label: "Role" },
        ]}
        rows={APPROVAL_RULES.map((r) => [
          r.docType,
          r.minAmount.toLocaleString(),
          r.approverName,
          r.approverRole,
        ])}
      />
    </DocumentList>
  );
}
