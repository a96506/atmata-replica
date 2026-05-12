import { getTranslations } from "next-intl/server";
import { InboxRowActions } from "./inbox-row-actions";
import { DEMO_INBOX } from "@/lib/demo-data";

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-slate-100 text-slate-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const SOURCE_LABEL: Record<string, string> = {
  audit_log: "AI decision",
  document_processing: "Invoice",
  reconciliation: "Bank recon",
  credit_hold: "Credit hold",
  supply_chain_alert: "Supply chain",
  duplicate_group: "Duplicate",
};

export default async function InboxPage() {
  const t = await getTranslations("inbox");
  const data = DEMO_INBOX;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-700">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(data.by_source).map(([k, v]) => (
            <span
              key={k}
              className="rounded-full bg-orange-50 px-3 py-1 font-medium text-orange-800"
            >
              {SOURCE_LABEL[k] ?? k}: {v}
            </span>
          ))}
        </div>
      </header>

      {data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-lg font-medium text-slate-900">{t("empty")}</p>
          <p className="mt-1 text-sm text-slate-600">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li
              key={`${item.source}-${item.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                      {SOURCE_LABEL[item.source] ?? item.source}
                    </span>
                    {item.severity && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[item.severity] ?? "bg-slate-100 text-slate-800"}`}
                      >
                        {item.severity}
                      </span>
                    )}
                    {item.confidence !== null && item.confidence !== undefined && (
                      <span className="text-xs text-slate-600">
                        {t("confidence")} {(item.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{item.title}</h3>
                  {item.ai_reasoning && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-700">{item.ai_reasoning}</p>
                  )}
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <InboxRowActions source={item.source} id={item.id} />
                  <time className="text-xs text-slate-500" dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleString()}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
