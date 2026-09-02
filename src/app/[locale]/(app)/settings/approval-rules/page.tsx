import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listApprovalRules } from "@/lib/api/master";
import {
  createApprovalRuleAction,
  deleteApprovalRuleAction,
  updateApprovalRuleAction,
} from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "doc", label: "Doc type" },
  { key: "min", label: "Min amount" },
  { key: "max", label: "Max amount" },
  { key: "roles", label: "Approver roles" },
  { key: "seq", label: "Sequence" },
  { key: "active", label: "Active" },
];

const DOC_TYPES = [
  "pr",
  "rfq",
  "po",
  "grn",
  "vendor_bill",
  "vendor_payment",
  "vendor_return",
  "debit_note",
  "quote",
  "so",
  "dn",
  "customer_invoice",
  "customer_receipt",
  "customer_return",
  "credit_note",
  "journal_entry",
  "stock_adjustment",
  "internal_transfer",
].map((d) => ({ value: d, label: d }));

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rules = await listApprovalRules();

  const fields: MasterField[] = [
    { name: "docType", label: "Doc type", type: "select", required: true, options: DOC_TYPES },
    { name: "minAmount", label: "Min amount", type: "money", currency: "KWD" },
    { name: "maxAmount", label: "Max amount", type: "number", min: 0, help: "Blank = no upper cap" },
    {
      name: "approverRoles",
      label: "Approver roles",
      type: "tags",
      required: true,
      placeholder: "admin, approver, …",
      help: "Comma-separated roles, e.g. admin, approver",
    },
    { name: "sequence", label: "Sequence", type: "number", min: 1 },
    { name: "active", label: "Active", type: "boolean" },
  ];

  const entities = rules.map((r) => ({
    id: r.id,
    docType: r.docType,
    minAmount: Number(r.minAmount),
    maxAmount: r.maxAmount == null ? "" : Number(r.maxAmount),
    approverRoles: r.approverRoles ?? [],
    sequence: r.sequence,
    active: r.active,
  }));

  const tableRows = rules.map((r) => [
    r.docType,
    Number(r.minAmount).toLocaleString(),
    r.maxAmount == null ? "—" : Number(r.maxAmount).toLocaleString(),
    (r.approverRoles ?? []).join(", "),
    String(r.sequence),
    r.active ? "yes" : "no",
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Approval rule"
      title="Approval rules"
      subtitle="Doc type × min amount → approver chain. Used by the approval-route preview on every submit."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createApprovalRuleAction}
      onUpdate={updateApprovalRuleAction}
      onDelete={deleteApprovalRuleAction}
      writeOperation="create_approval_rule"
    />
  );
}
