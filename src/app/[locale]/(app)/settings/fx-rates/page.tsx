import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listFxRates } from "@/lib/api/master";
import {
  createFxRateAction,
  deleteFxRateAction,
  updateFxRateAction,
} from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "date", label: "Date" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "rate", label: "Rate" },
  { key: "source", label: "Source" },
];

const CURRENCY_OPTIONS = [
  { value: "KWD", label: "KWD" },
  { value: "SAR", label: "SAR" },
  { value: "AED", label: "AED" },
  { value: "USD", label: "USD" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rates = await listFxRates();

  const fields: MasterField[] = [
    {
      name: "baseCurrency",
      label: "Base",
      type: "select",
      required: true,
      options: CURRENCY_OPTIONS,
    },
    {
      name: "quoteCurrency",
      label: "Quote",
      type: "select",
      required: true,
      options: CURRENCY_OPTIONS,
    },
    {
      name: "rate",
      label: "Rate",
      type: "number",
      required: true,
      min: 0,
      help: "Quote units per 1 base unit",
    },
    { name: "rateDate", label: "Rate date", type: "date", required: true },
    {
      name: "source",
      label: "Source",
      type: "text",
      placeholder: "manual",
      help: "Defaults to manual when blank",
    },
  ];

  const sorted = rates.slice().sort((a, b) => b.rateDate.localeCompare(a.rateDate));

  const entities = sorted.map((r) => ({
    id: r.id,
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: r.rate,
    rateDate: r.rateDate,
    source: r.source,
  }));

  const tableRows = sorted.map((r) => [
    r.rateDate,
    r.baseCurrency,
    r.quoteCurrency,
    Number(r.rate).toFixed(5),
    r.source,
  ]);

  return (
    <MasterCrud
      locale={locale}
      entityLabel="FX rate"
      title="FX rates"
      subtitle="Daily cross-rates used on multi-currency documents. Most-recent rate wins."
      columns={COLUMNS}
      tableRows={tableRows}
      entities={entities}
      fields={fields}
      onCreate={createFxRateAction}
      onUpdate={updateFxRateAction}
      onDelete={deleteFxRateAction}
      writeOperation="create_fx_rate"
    />
  );
}
