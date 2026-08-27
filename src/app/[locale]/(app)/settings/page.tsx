import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { navigation } from "@/config/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "settings");

/**
 * Tile copy keyed by route. Labels, icons, grouping, and ordering all come from
 * `@/config/navigation` so this overview can never drift from the sidebar — the
 * previous hardcoded list had gone stale and shipped a dead `/settings/thresholds`
 * tile that 404'd.
 */
const DESCRIPTIONS: Record<string, string> = {
  "/settings/company": "Tenant tax profile, base currency, VAT",
  "/settings/branches": "Operating branches per company",
  "/settings/warehouses": "Locations sub-structure",
  "/settings/fiscal-calendar": "Periods · open / soft-close / hard-close",
  "/settings/coa": "Account tree by class",
  "/settings/tax-codes": "KW / SA / AE jurisdictions",
  "/settings/currencies": "Active currencies",
  "/settings/fx-rates": "Daily cross-rates",
  "/settings/payment-terms": "Net days · prepayment",
  "/settings/bank-accounts": "Operating accounts",
  "/settings/customers": "Credit limit · exposure · hold flag",
  "/settings/suppliers": "Bank + tax info · WHT flag",
  "/settings/products": "UoM · tax class · costing · lot/serial",
  "/settings/price-lists": "Customer-specific pricing",
  "/settings/sequences": "Doc-number formats",
  "/settings/users": "Roles + permissions",
  "/settings/approval-rules": "Doc type × amount → chain",
};

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("settings");

  // Skip the leading "Overview" group — that is this page.
  const groups =
    navigation
      .find((m) => m.key === "settings")
      ?.groups.filter((g) => g.label) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("overviewTitle")}
        description={t("overviewSubtitle")}
      />

      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {group.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.href}
                  className="focus-within:ring-ring group relative py-0 transition-colors focus-within:ring-2 hover:ring-primary/40"
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    {Icon ? (
                      <span
                        className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md"
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>
                    ) : null}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/${locale}${item.href}`}
                        className="text-sm font-semibold outline-none"
                      >
                        {/* Stretched hit area: whole card is clickable, one tab stop. */}
                        <span className="absolute inset-0 rounded-xl" />
                        {item.label}
                      </Link>
                      <span className="text-muted-foreground text-xs text-pretty">
                        {DESCRIPTIONS[item.href]}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
