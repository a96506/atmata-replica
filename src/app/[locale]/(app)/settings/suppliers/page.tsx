import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import { listSuppliers, listPaymentTerms } from "@/lib/api/master";
import { pageMetadata } from "@/lib/metadata";
import {
  createSupplierAction,
  deleteSupplierAction,
  updateSupplierAction,
} from "@/lib/actions/master";

export const generateMetadata = pageMetadata("nav", "suppliers");

const COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "vat", label: "VAT" },
  { key: "iban", label: "Bank account" },
  { key: "term", label: "Payment term" },
  { key: "wht", label: "WHT" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [rows, terms] = await Promise.all([listSuppliers(), listPaymentTerms()]);

  const fields: MasterField[] = [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "vatNumber", label: "VAT number", type: "text" },
    { name: "bankAccount", label: "Bank account / IBAN", type: "text" },
    {
      name: "paymentTermId",
      label: "Payment term",
      type: "searchSelect",
      required: true,
      options: terms.map((t) => ({
        value: t.id,
        label: `${t.code} · ${t.nameEn}`,
        hint: `Net ${t.netDays}d`,
      })),
    },
    { name: "whtApplicable", label: "Withholding tax applies", type: "boolean" },
    { name: "whtRate", label: "WHT rate (0–1)", type: "number", min: 0, help: "e.g. 0.05 for 5%" },
  ];

  const entities = rows.map((s) => ({
    id: s.id,
    name: s.name,
    vatNumber: s.vatNumber ?? "",
    bankAccount: s.bankAccount ?? "",
    paymentTermId: s.paymentTermId,
    whtApplicable: s.whtApplicable ?? false,
    whtRate: s.whtRate ?? "",
  }));

  const tableRows = rows.map((s) => [
    <Link
      key="n"
      href={`/${locale}/settings/suppliers/${s.id}`}
      className="font-medium text-primary hover:underline"
    >
      {s.name}
    </Link>,
    s.vatNumber ?? "—",
    <span key="i" className="font-mono text-xs">
      {s.bankAccount ?? "—"}
    </span>,
    s.paymentTermId,
    s.whtApplicable ? (
      <span
        key="w"
        className="bg-status-pending-muted text-status-pending-foreground rounded-full px-2 py-0.5 text-xs"
      >
        {((s.whtRate ?? 0.05) * 100).toFixed(0)}%
      </span>
    ) : (
      "—"
    ),
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Supplier"
      title="Suppliers"
      subtitle="Bank + tax info · WHT flag."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createSupplierAction}
      onUpdate={updateSupplierAction}
      onDelete={deleteSupplierAction}
      extraActions={
        <ExportCsvButton
          rows={rows}
          filename="suppliers"
          columns={[
            { label: "Name", value: (s) => s.name },
            { label: "VAT number", value: (s) => s.vatNumber ?? "" },
            { label: "Bank account", value: (s) => s.bankAccount ?? "" },
            { label: "Payment term id", value: (s) => s.paymentTermId ?? "" },
            { label: "WHT applicable", value: (s) => s.whtApplicable ?? false },
            { label: "WHT rate", value: (s) => s.whtRate ?? "" },
          ]}
        />
      }
    />
  );
}
