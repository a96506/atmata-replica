import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function AccountingPage() {
  const t = await getTranslations("accounting");
  const cards = [
    { href: "/accounting/invoices" as const, label: t("invoices"), desc: t("invoicesDesc") },
    {
      href: "/accounting/reconciliation" as const,
      label: t("reconciliation"),
      desc: t("reconciliationDesc"),
    },
    { href: "/accounting/financials" as const, label: t("financials"), desc: t("financialsDesc") },
    { href: "/accounting/close" as const, label: t("close"), desc: t("closeDesc") },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-foreground">{t("subtitle")}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
          >
            <h2 className="font-semibold text-foreground">{c.label}</h2>
            <p className="mt-1 text-sm text-foreground">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
