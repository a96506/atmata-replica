import Link from "next/link";
import { type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { CustomersExportClient } from "./customers-export-client";
import { listCustomersPage } from "@/lib/api/master";
import { parseListPage } from "@/lib/db/read";
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[]; limit?: string | string[] }>;
}) {
  const { locale } = await params;
  const { page, limit, offset } = parseListPage(await searchParams);
  const { items: rows, total } = await listCustomersPage({ limit, offset });

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
      writeOperation="create_customer"
      serverPagination={{ page, pageSize: limit, total }}
      extraActions={
        <CustomersExportClient rows={rows} />
      }
    />
  );
}
