"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
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
            <button
              type="button"
              className="cursor-pointer rounded bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              onClick={() => toast.success(`${t("approve")} · #${id} (demo)`)}
            >
              {t("approve")}
            </button>
            {source === "audit_log" && (
              <button
                type="button"
                className="cursor-pointer rounded bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                onClick={() => toast.message(`${t("reject")} · #${id} (demo)`)}
              >
                {t("reject")}
              </button>
            )}
          </>
        )}
        {href && (
          <Link
            href={href}
            className="cursor-pointer rounded bg-orange-100 px-3 py-1 text-xs font-medium text-orange-900 hover:bg-orange-200"
          >
            {t("openWorkspace")}
          </Link>
        )}
      </div>
    </div>
  );
}
