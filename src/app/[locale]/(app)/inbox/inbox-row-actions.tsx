"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import { Link } from "@/i18n/navigation";

const APPROVABLE_SOURCES = new Set([
  "audit_log",
  "document_processing",
  "supply_chain_alert",
  "duplicate_group",
]);

const WORKSPACE_ROUTES: Record<string, string> = {
  reconciliation: "/accounting/reconciliation",
  credit_hold: "/accounting",
};

export function InboxRowActions({
  source,
  id,
}: {
  source: string;
  id: number;
}) {
  const t = useTranslations("inbox");

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
        {WORKSPACE_ROUTES[source] && (
          <Link
            href={WORKSPACE_ROUTES[source]}
            className="cursor-pointer rounded bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900 hover:bg-slate-200"
          >
            {t("openWorkspace")}
          </Link>
        )}
      </div>
    </div>
  );
}
