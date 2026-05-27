import Link from "next/link";
import { getTranslations } from "next-intl/server";

const TILES = [
  { href: "/settings/company", label: "Company", desc: "Tenant tax profile, base currency, VAT" },
  { href: "/settings/branches", label: "Branches", desc: "Operating branches per company" },
  { href: "/settings/fiscal-calendar", label: "Fiscal calendar", desc: "Periods · open / soft-close / hard-close" },
  { href: "/settings/coa", label: "Chart of accounts", desc: "Account tree by class" },
  { href: "/settings/tax-codes", label: "Tax codes", desc: "KW / SA / AE jurisdictions" },
  { href: "/settings/currencies", label: "Currencies", desc: "Active currencies" },
  { href: "/settings/fx-rates", label: "FX rates", desc: "Daily cross-rates" },
  { href: "/settings/payment-terms", label: "Payment terms", desc: "Net days · prepayment" },
  { href: "/settings/sequences", label: "Sequences", desc: "Doc-number formats" },
  { href: "/settings/customers", label: "Customers", desc: "Credit limit · exposure · hold flag" },
  { href: "/settings/suppliers", label: "Suppliers", desc: "Bank + tax info · WHT flag" },
  { href: "/settings/products", label: "Products", desc: "UoM · tax class · costing · lot/serial" },
  { href: "/settings/price-lists", label: "Price lists", desc: "Customer-specific pricing" },
  { href: "/settings/warehouses", label: "Warehouses", desc: "Locations sub-structure" },
  { href: "/settings/bank-accounts", label: "Bank accounts", desc: "Operating accounts" },
  { href: "/settings/approval-rules", label: "Approval rules", desc: "Doc type × amount → chain" },
  { href: "/settings/users", label: "Users", desc: "Roles + permissions" },
  { href: "/settings/thresholds", label: "AI thresholds", desc: "OCR confidence + post tolerances" },
];

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-700">{t("subtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={`/${locale}${tile.href}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-orange-300 hover:bg-orange-50"
          >
            <div className="text-sm font-semibold text-slate-900">{tile.label}</div>
            <div className="mt-0.5 text-xs text-slate-600">{tile.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
