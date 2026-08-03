import { getTranslations } from "next-intl/server";
import { InboxRowActions } from "./inbox-row-actions";
import { DEMO_INBOX } from "@/lib/demo-data";

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-muted text-foreground",
  medium: "bg-status-pending-muted text-status-pending-foreground",
  high: "bg-primary/10 text-primary",
  critical: "bg-status-danger-muted text-destructive",
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
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(data.by_source).map(([k, v]) => (
            <span
              key={k}
              className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary"
            >
              {SOURCE_LABEL[k] ?? k}: {v}
            </span>
          ))}
        </div>
      </header>

      {data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-input bg-card p-12 text-center">
          <p className="text-lg font-medium text-foreground">{t("empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li
              key={`${item.source}-${item.id}`}
              className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {SOURCE_LABEL[item.source] ?? item.source}
                    </span>
                    {item.severity && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[item.severity] ?? "bg-muted text-foreground"}`}
                      >
                        {item.severity}
                      </span>
                    )}
                    {item.confidence !== null && item.confidence !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {t("confidence")} {(item.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-foreground">{item.title}</h3>
                  {item.ai_reasoning && (
                    <p className="mt-1 line-clamp-2 text-sm text-foreground">{item.ai_reasoning}</p>
                  )}
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <InboxRowActions
                    source={item.source}
                    id={item.id}
                    sourceUrl={item.source_url}
                  />
                  <time className="text-xs text-muted-foreground" dateTime={item.created_at}>
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
