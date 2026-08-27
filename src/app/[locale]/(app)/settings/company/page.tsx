import { DataTable, type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { CompanyDataControls } from "@/components/settings/CompanyDataControls";
import { listCompanies } from "@/lib/api/master";
import { updateCompanyProfileAction } from "@/lib/actions/master";

const COLUMNS: Column[] = [
  { key: "name", label: "Legal name" },
  { key: "profile", label: "Tax profile" },
  { key: "currency", label: "Base currency" },
  { key: "vat", label: "VAT number" },
];

const TAX_PROFILES = [
  { value: "KW", label: "Kuwait (KW)" },
  { value: "SA", label: "Saudi Arabia (SA)" },
  { value: "AE", label: "UAE (AE)" },
];

const CURRENCIES = ["KWD", "SAR", "AED", "USD"].map((c) => ({ value: c, label: c }));

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const rows = await listCompanies();

  const fields: MasterField[] = [
    { name: "name", label: "Legal name", type: "text", required: true },
    { name: "taxProfile", label: "Tax profile", type: "select", required: true, options: TAX_PROFILES },
    { name: "baseCurrency", label: "Base currency", type: "select", required: true, options: CURRENCIES },
    { name: "vatNumber", label: "VAT number", type: "text" },
  ];

  const entities = rows.map((c) => ({
    id: c.id,
    name: c.name,
    taxProfile: c.taxProfile,
    baseCurrency: c.baseCurrency,
    vatNumber: c.vatNumber ?? "",
  }));

  const tableRows = rows.map((c) => [
    c.name,
    c.taxProfile,
    c.baseCurrency,
    c.vatNumber ?? "—",
  ]);

  return (
    <div className="flex flex-col gap-6">
      <MasterCrud
        locale={locale}
        entityLabel="Company profile"
        title="Company profile"
        subtitle="Your company's legal details — shown on every invoice you issue."
        columns={COLUMNS}
        tableRows={tableRows}
        entities={entities}
        fields={fields}
        onCreate={updateCompanyProfileAction}
        onUpdate={updateCompanyProfileAction}
        onDelete={updateCompanyProfileAction}
        hideCreate
        hideDelete
        formBanner={
          <div className="rounded-md border border-status-info-border bg-status-info-muted p-2 text-xs text-status-info-foreground">
            Editing updates your own company record. Address and logo fields are
            not yet stored on the company table — they will be added in a later
            schema pass.
          </div>
        }
      />
      <CompanyDataControls locale={locale} />
    </div>
  );
}
