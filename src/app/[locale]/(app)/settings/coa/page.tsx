import { type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listAccounts } from "@/lib/api/gl";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "@/lib/actions/master";

const TYPE_ORDER: Record<string, number> = {
  asset: 1,
  liability: 2,
  equity: 3,
  revenue: 4,
  expense: 5,
};

const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];

const COLUMNS: Column[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "parent", label: "Parent" },
  { key: "active", label: "Active" },
];

function typeBadge(type: string) {
  const cls =
    type === "asset"
      ? "bg-status-success-muted text-status-success-foreground"
      : type === "liability"
        ? "bg-status-danger-muted text-destructive"
        : type === "equity"
          ? "bg-status-info-muted text-status-info-foreground"
          : type === "revenue"
            ? "bg-status-info-muted text-status-info-foreground"
            : "bg-status-pending-muted text-status-pending-foreground";
  return (
    <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + cls}>
      {type}
    </span>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const accounts = await listAccounts();
  const rows = accounts.slice().sort((a, b) => {
    const t = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (t !== 0) return t;
    return a.code.localeCompare(b.code);
  });

  const byId = new Map(rows.map((a) => [a.id, a]));
  const bilingual = accounts.filter((a) => /[\u0600-\u06FF]/.test(a.name));

  const parentOptions = rows.map((a) => ({
    value: a.id,
    label: `${a.code} · ${a.name}`,
    hint: a.type,
  }));

  const fields: MasterField[] = [
    { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. 1200" },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "type", label: "Type", type: "select", required: true, options: ACCOUNT_TYPES },
    {
      name: "parent",
      label: "Parent account",
      type: "searchSelect",
      options: parentOptions,
      help: "Optional — groups this account under a parent in the tree.",
    },
    { name: "active", label: "Active", type: "boolean" },
  ];

  const entities = rows.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parent: a.parent ?? "",
    active: a.active ?? true,
  }));

  const tableRows = rows.map((a) => {
    const parent = a.parent ? byId.get(a.parent) : undefined;
    return [
      <span key="c" className="font-mono text-xs">{a.code}</span>,
      a.name,
      typeBadge(a.type),
      parent ? `${parent.code} · ${parent.name}` : "—",
      a.active === false ? "no" : "yes",
    ];
  });

  const formBanner =
    bilingual.length > 0 ? (
      <div className="rounded-md border border-status-pending-border bg-status-pending-muted p-2 text-xs text-status-pending-foreground">
        Note: {bilingual.length} account name(s) contain mixed-language text
        (EN + AR in one field): {bilingual.map((a) => a.code).join(", ")}. This
        is a seed-data issue to be cleaned up in a separate migration; the
        table stores a single name column.
      </div>
    ) : undefined;

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Account"
      title="Chart of accounts"
      subtitle="Account tree by class. Used by every posted document to write its journal entry."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createAccountAction}
      onUpdate={updateAccountAction}
      onDelete={deleteAccountAction}
      writeOperation="create_account"
      formBanner={formBanner}
    />
  );
}
