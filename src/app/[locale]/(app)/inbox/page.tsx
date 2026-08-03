import { getTranslations } from "next-intl/server";
import { InboxRowActions } from "./inbox-row-actions";
import { DEMO_INBOX } from "@/lib/demo-data";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty } from "@/components/state/Empty";

/**
 * Four-step ramp from neutral to destructive so triage order reads at a glance.
 * Previously `high` reused the primary tint, which made it read as an accent
 * rather than a step above `medium`.
 */
const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-status-info-muted text-status-info-foreground",
  high: "bg-status-pending-muted text-status-pending-foreground",
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(data.by_source).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-medium">
                {SOURCE_LABEL[k] ?? k}
                <span className="text-muted-foreground ms-1 tabular-nums">
                  {v}
                </span>
              </Badge>
            ))}
          </div>
        }
      />

      {data.items.length === 0 ? (
        <Empty title={t("empty")} description={t("emptyHint")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <li key={`${item.source}-${item.id}`}>
              <Card className="py-0 transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {SOURCE_LABEL[item.source] ?? item.source}
                      </Badge>
                      {item.severity && (
                        <Badge
                          className={
                            SEVERITY_BADGE[item.severity] ??
                            "bg-muted text-muted-foreground"
                          }
                        >
                          {item.severity}
                        </Badge>
                      )}
                      {item.confidence !== null &&
                        item.confidence !== undefined && (
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {t("confidence")}{" "}
                            {(item.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                    </div>
                    <h3 className="text-sm font-semibold text-pretty">
                      {item.title}
                    </h3>
                    {item.ai_reasoning && (
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {item.ai_reasoning}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <InboxRowActions
                      source={item.source}
                      id={item.id}
                      sourceUrl={item.source_url}
                    />
                    <time
                      className="text-muted-foreground text-xs"
                      dateTime={item.created_at}
                    >
                      {new Date(item.created_at).toLocaleString()}
                    </time>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
