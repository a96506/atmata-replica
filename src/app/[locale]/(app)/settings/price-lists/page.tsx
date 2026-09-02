import Link from "next/link";
import { type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listPriceLists } from "@/lib/api/master";
import {
  createPriceListAction,
  deletePriceListAction,
  updatePriceListAction,
} from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "currency", label: "Currency" },
  { key: "active", label: "Active" },
  { key: "from", label: "Valid from" },
  { key: "until", label: "Valid until" },
];

const CURRENCIES = ["KWD", "SAR", "AED", "USD"].map((c) => ({ value: c, label: c }));

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listPriceLists();

  const fields: MasterField[] = [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "currency", label: "Currency", type: "select", required: true, options: CURRENCIES },
    { name: "active", label: "Active", type: "boolean" },
    { name: "startsOn", label: "Valid from", type: "date" },
    { name: "endsOn", label: "Valid until", type: "date" },
  ];

  const entities = rows.map((p) => ({
    id: p.id,
    name: p.name,
    currency: p.currency,
    active: p.active,
    startsOn: p.startsOn ?? "",
    endsOn: p.endsOn ?? "",
  }));

  const tableRows = rows.map((p) => [
    <Link
      key="n"
      href={`/${locale}/settings/price-lists/${p.id}`}
      className="font-medium text-primary hover:underline"
    >
      {p.name}
    </Link>,
    p.currency,
    p.active ? "yes" : "no",
    p.startsOn ?? "—",
    p.endsOn ?? "—",
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="Price list"
      title="Price lists"
      subtitle="Customer-specific or default pricing. Each line on a quote/SO resolves the active list at line-add time."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createPriceListAction}
      onUpdate={updatePriceListAction}
      onDelete={deletePriceListAction}
      writeOperation="create_price_list"
    />
  );
}
