import { getTranslations } from "next-intl/server";
import { InboxRowActions } from "./inbox-row-actions";
import { inboxDocPath, listInboxNotifications } from "@/lib/api/inbox";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty } from "@/components/state/Empty";
import { pageMetadata } from "@/lib/metadata";

export const generateMetadata = pageMetadata("nav", "inbox");

const KIND_LABEL: Record<string, string> = {
  approval_requested: "Approval requested",
  approval_resolved: "Approval resolved",
  system: "System",
  ops_reorder: "Reorder",
  ops_stale_draft: "Stale draft",
  ops_abc: "ABC",
  ops_schedule_failure: "Schedule failure",
  ops_fx_stale: "FX stale",
  ops_depreciation_blocked: "Depreciation",
};

function localizeOpsCopy(
  kind: string,
  title: string,
  body: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): { title: string; body: string } | null {
  const isSchedule =
    kind === "ops_schedule_failure" || title === "schedule_failure";
  const isFx = kind === "ops_fx_stale" || title === "fx_stale";
  if (isSchedule) {
    const jobMatch = body.match(/Scheduled job "([^"]+)" failed/i);
    return {
      title: t("kindScheduleFailure"),
      body: jobMatch
        ? t("bodyScheduleFailureWithJob", { job: jobMatch[1] })
        : t("bodyScheduleFailure"),
    };
  }
  if (isFx) {
    const lower = body.toLowerCase();
    const bodyKey =
      lower.includes("provider") || lower.includes("fetch failed")
        ? "bodyFxStaleProvider"
        : lower.includes("older than") || lower.includes("three days")
          ? "bodyFxStalePublication"
          : "bodyFxStale";
    return { title: t("kindFxStale"), body: t(bodyKey) };
  }
  return null;
}

export default async function InboxPage() {
  const t = await getTranslations("inbox");
  const items = await listInboxNotifications().catch(() => []);

  const bySource: Record<string, number> = {};
  for (const item of items) {
    bySource[item.kind] = (bySource[item.kind] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(bySource).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-medium">
                {k === "ops_schedule_failure"
                  ? t("kindScheduleFailure")
                  : k === "ops_fx_stale"
                    ? t("kindFxStale")
                    : (KIND_LABEL[k] ?? k)}
                <span className="text-muted-foreground ms-1 tabular-nums">
                  {v}
                </span>
              </Badge>
            ))}
          </div>
        }
      />

      {items.length === 0 ? (
        <Empty title={t("empty")} description={t("emptyHint")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const localized = localizeOpsCopy(item.kind, item.title, item.body, t);
            const title = localized?.title ?? item.title;
            const body = localized?.body ?? item.body;
            const kindLabel =
              item.kind === "ops_schedule_failure" || item.title === "schedule_failure"
                ? t("kindScheduleFailure")
                : item.kind === "ops_fx_stale" || item.title === "fx_stale"
                  ? t("kindFxStale")
                  : (KIND_LABEL[item.kind] ?? item.kind);
            const sourceUrl =
              item.kind === "ops_reorder"
                ? "/inventory"
                : item.kind.startsWith("ops_")
                  ? "/inventory"
                  : inboxDocPath(item.docType, item.docId);
            // `pending:*` mark-read upserts a notifications row; `ops:*` stays
            // UI-only until an ops dismissal path exists (kind CHECK blocks ops kinds).
            const canMarkRead = !item.id.startsWith("ops:");
            return (
              <li key={item.id}>
                <Card
                  className={`py-0 transition-shadow hover:shadow-md ${
                    item.readAt ? "opacity-70" : ""
                  }`}
                >
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {kindLabel}
                        </Badge>
                        {!item.readAt ? (
                          <Badge className="bg-status-info-muted text-status-info-foreground">
                            unread
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-semibold text-pretty">
                        {title}
                      </h3>
                      {body ? (
                        <p className="text-muted-foreground line-clamp-2 text-sm">
                          {body}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      <InboxRowActions
                        source={item.kind}
                        id={item.id}
                        sourceUrl={sourceUrl}
                        notificationId={canMarkRead ? item.id : null}
                        doc={{
                          docType: item.docType,
                          docId: item.docId,
                          rowVersion: item.rowVersion ?? null,
                        }}
                      />
                      <time
                        className="text-muted-foreground text-xs"
                        dateTime={item.createdAt}
                      >
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
