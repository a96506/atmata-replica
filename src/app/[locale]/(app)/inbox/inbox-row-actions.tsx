"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";

const APPROVABLE_SOURCES = new Set([
  "audit_log",
  "document_processing",
  "supply_chain_alert",
  "duplicate_group",
]);

const FALLBACK_ROUTES: Record<string, string> = {
  reconciliation: "/accounting/reconciliation",
  credit_hold: "/accounting",
};

export function InboxRowActions({
  source,
  id,
  sourceUrl,
}: {
  source: string;
  id: number;
  sourceUrl?: string | null;
}) {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const target = sourceUrl ?? FALLBACK_ROUTES[source] ?? null;
  const href = target ? `/${locale}${target}` : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        {APPROVABLE_SOURCES.has(source) && (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => toast.success(`${t("approve")} · #${id} (demo)`)}
            >
              {t("approve")}
            </Button>
            {source === "audit_log" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => toast.message(`${t("reject")} · #${id} (demo)`)}
              >
                {t("reject")}
              </Button>
            )}
          </>
        )}
        {href && (
          <Button asChild size="sm" variant="ghost">
            <Link href={href}>{t("openWorkspace")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
