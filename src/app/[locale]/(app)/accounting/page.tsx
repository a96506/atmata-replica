import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BookCheck,
  FileText,
  PieChart,
  Scale,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "accounting");

export default async function AccountingPage() {
  const t = await getTranslations("accounting");
  const cards = [
    {
      href: "/accounting/invoices" as const,
      label: t("invoices"),
      desc: t("invoicesDesc"),
      Icon: FileText,
    },
    {
      href: "/accounting/reconciliation" as const,
      label: t("reconciliation"),
      desc: t("reconciliationDesc"),
      Icon: Scale,
    },
    {
      href: "/accounting/financials" as const,
      label: t("financials"),
      desc: t("financialsDesc"),
      Icon: PieChart,
    },
    {
      href: "/accounting/close" as const,
      label: t("close"),
      desc: t("closeDesc"),
      Icon: BookCheck,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ href, label, desc, Icon }) => (
          <Card
            key={href}
            className="focus-within:ring-ring group relative transition-colors focus-within:ring-2 hover:ring-primary/40"
          >
            <CardContent className="flex flex-col gap-3">
              <span
                className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md"
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-semibold">
                  {/* Stretched link keeps the whole card clickable while the
                      accessible name stays on a single real anchor. */}
                  <Link
                    href={href}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                  >
                    {label}
                  </Link>
                </h2>
                <p className="text-muted-foreground text-sm text-pretty">
                  {desc}
                </p>
              </div>
              <ArrowRight
                className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                aria-hidden
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
