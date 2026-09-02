import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listCurrencies } from "@/lib/api/master";
import {
  createCurrencyAction,
  deleteCurrencyAction,
  updateCurrencyAction,
} from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "symbol", label: "Symbol" },
  { key: "dp", label: "Decimal places" },
  { key: "active", label: "Active?" },
];

const CODE_OPTIONS = [
  { value: "KWD", label: "KWD — Kuwaiti Dinar" },
  { value: "SAR", label: "SAR — Saudi Riyal" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "USD", label: "USD — US Dollar" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listCurrencies();

  const fields: MasterField[] = [
    { name: "code", label: "Code", type: "select", required: true, options: CODE_OPTIONS },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "symbol", label: "Symbol", type: "text", required: true, placeholder: "e.g. KD, $" },
    {
      name: "decimalPlaces",
      label: "Decimal places",
      type: "number",
      required: true,
      min: 0,
      help: "0–6 display precision",
    },
    { name: "active", label: "Active", type: "boolean" },
  ];

  const entities = rows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    decimalPlaces: c.decimalPlaces,
    active: c.active,
  }));

  const tableRows = rows.map((c) => [
    c.code,
    c.name,
    c.symbol,
    c.decimalPlaces,
    c.active ? "yes" : "no",
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Currency"
      title="Currencies"
      subtitle="Company currencies and display precision (SQL-backed)."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createCurrencyAction}
      onUpdate={updateCurrencyAction}
      onDelete={deleteCurrencyAction}
      writeOperation="create_currency"
    />
  );
}
