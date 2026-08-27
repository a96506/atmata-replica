import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listTaxCodes } from "@/lib/api/master";
import {
  createTaxCodeAction,
  deleteTaxCodeAction,
  updateTaxCodeAction,
} from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "code", label: "Code" },
  { key: "jur", label: "Jurisdiction" },
  { key: "nameEn", label: "Name (EN)" },
  { key: "nameAr", label: "Name (AR)" },
  { key: "rate", label: "Rate" },
  { key: "in", label: "Input?" },
  { key: "out", label: "Output?" },
];

const JURISDICTIONS = [
  { value: "KW", label: "Kuwait (KW)" },
  { value: "SA", label: "Saudi Arabia (SA)" },
  { value: "AE", label: "UAE (AE)" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listTaxCodes();

  const fields: MasterField[] = [
    { name: "jurisdiction", label: "Jurisdiction", type: "select", required: true, options: JURISDICTIONS },
    { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. STANDARD, SA-15" },
    { name: "nameEn", label: "Name (EN)", type: "text", required: true },
    { name: "nameAr", label: "Name (AR)", type: "text", required: true },
    { name: "rate", label: "Rate (0–1)", type: "number", required: true, min: 0, help: "e.g. 0.15 for 15%" },
    { name: "isInput", label: "Input VAT", type: "boolean" },
    { name: "isOutput", label: "Output VAT", type: "boolean" },
  ];

  const entities = rows.map((t) => ({
    id: t.id,
    jurisdiction: t.jurisdiction,
    code: t.code,
    nameEn: t.nameEn,
    nameAr: t.nameAr,
    rate: t.rate,
    isInput: t.isInput,
    isOutput: t.isOutput,
  }));

  const tableRows = rows.map((t) => [
    t.code,
    t.jurisdiction,
    t.nameEn,
    t.nameAr,
    `${(t.rate * 100).toFixed(0)}%`,
    t.isInput ? "yes" : "no",
    t.isOutput ? "yes" : "no",
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Tax code"
      title="Tax codes"
      subtitle="KW / SA / AE jurisdictions. Each code carries an EN + AR name and a rate."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createTaxCodeAction}
      onUpdate={updateTaxCodeAction}
      onDelete={deleteTaxCodeAction}
    />
  );
}
