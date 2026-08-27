import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { ExportCsvButton } from "@/components/export/ExportCsvButton";
import { listCustomers } from "@/lib/api/master";
import { pageMetadata } from "@/lib/metadata";
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from "@/lib/actions/master";

export const generateMetadata = pageMetadata("nav", "customers");

const COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "vat", label: "VAT" },
  { key: "limit", label: "Limit" },
  { key: "exp", label: "Exposure" },
  { key: "pay", label: "Payment" },
  { key: "score", label: "Score" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listCustomers();

  const fields: MasterField[] = [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "vatNumber", label: "VAT number", type: "text" },
    { name: "creditLimit", label: "Credit limit", type: "money", currency: "KWD" },
    {
      name: "creditScore",
      label: "Credit score",
      type: "select",
      options: [
        { value: "A", label: "A" },
        { value: "B", label: "B" },
        { value: "C", label: "C" },
        { value: "D", label: "D" },
      ],
    },
  ];

  const entities = rows.map((c) => ({
    id: c.id,
    name: c.name,
    vatNumber: c.vatNumber ?? "",
    creditLimit: c.creditLimit,
    creditScore: c.creditScore,
  }));

  const tableRows = rows.map((c) => [
    <Link
      key="n"
      href={`/${locale}/settings/customers/${c.id}`}
      className="font-medium text-primary hover:underline"
    >
      {c.name}
    </Link>,
    c.vatNumber ?? "—",
    c.creditLimit.toLocaleString(),
    c.exposure.toLocaleString(),
    c.paymentStatus,
    c.creditScore,
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Customer"
      title="Customers"
      subtitle="Credit limit, exposure, hold flag."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createCustomerAction}
      onUpdate={updateCustomerAction}
      onDelete={deleteCustomerAction}
      extraActions={
        <ExportCsvButton
          rows={rows}
          filename="customers"
          columns={[
            { label: "Name", value: (c) => c.name },
            { label: "VAT number", value: (c) => c.vatNumber ?? "" },
            { label: "Credit limit", value: (c) => c.creditLimit },
            { label: "Exposure", value: (c) => c.exposure },
            { label: "Payment status", value: (c) => c.paymentStatus },
            { label: "Credit score", value: (c) => c.creditScore },
          ]}
        />
      }
    />
  );
}
