import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listBankAccounts, listCompanies } from "@/lib/api/master";
import { listAccounts } from "@/lib/api/gl";
import {
  createBankAccountAction,
  deleteBankAccountAction,
  updateBankAccountAction,
} from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "iban", label: "IBAN" },
  { key: "currency", label: "Currency" },
  { key: "company", label: "Company" },
];

const CURRENCIES = ["KWD", "SAR", "AED", "USD"].map((c) => ({ value: c, label: c }));

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [rows, companies, accounts] = await Promise.all([
    listBankAccounts(),
    listCompanies(),
    listAccounts(),
  ]);
  const assetAccounts = accounts.filter((a) => a.type === "asset");

  const fields: MasterField[] = [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "iban", label: "IBAN", type: "text", required: true },
    { name: "currency", label: "Currency", type: "select", required: true, options: CURRENCIES },
    {
      name: "accountId",
      label: "GL account (asset)",
      type: "searchSelect",
      options: assetAccounts.map((a) => ({
        value: a.id,
        label: `${a.code} · ${a.name}`,
        hint: a.type,
      })),
      help: "Optional — links this bank account to its asset GL account.",
    },
  ];

  const entities = rows.map((b) => ({
    id: b.id,
    name: b.name,
    iban: b.iban,
    currency: b.currency,
    accountId: (b as { accountId?: string }).accountId ?? "",
  }));

  const tableRows = rows.map((b) => [
    b.name,
    b.iban,
    b.currency,
    companies.find((c) => c.id === b.companyId)?.name ?? b.companyId,
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Bank account"
      title="Bank accounts"
      subtitle="Operating accounts per company."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createBankAccountAction}
      onUpdate={updateBankAccountAction}
      onDelete={deleteBankAccountAction}
    />
  );
}
