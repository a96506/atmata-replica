import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";

const CURRENCIES = [
  { code: "KWD", name: "Kuwaiti Dinar", dp: 3, default: true },
  { code: "SAR", name: "Saudi Riyal", dp: 2 },
  { code: "AED", name: "UAE Dirham", dp: 2 },
  { code: "USD", name: "US Dollar", dp: 2 },
];

export default async function Page() {
  return (
    <DocumentList title="Currencies" subtitle="Active currencies and display precision.">
      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "dp", label: "Decimal places" },
          { key: "default", label: "Default?" },
        ]}
        rows={CURRENCIES.map((c) => [c.code, c.name, c.dp, c.default ? "yes" : "—"])}
      />
    </DocumentList>
  );
}
