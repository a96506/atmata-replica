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
};

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
                {KIND_LABEL[k] ?? k}
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
            const sourceUrl = inboxDocPath(item.docType, item.docId);
            // Synthesized pending-approval items use ids like `pending:po:...`
            // and are not real notification rows — skip mark-read for them.
            const isSynthesized = item.id.startsWith("pending:");
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
                          {KIND_LABEL[item.kind] ?? item.kind}
                        </Badge>
                        {!item.readAt ? (
                          <Badge className="bg-status-info-muted text-status-info-foreground">
                            unread
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-semibold text-pretty">
                        {item.title}
                      </h3>
                      {item.body ? (
                        <p className="text-muted-foreground line-clamp-2 text-sm">
                          {item.body}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      <InboxRowActions
                        source={item.kind}
                        id={item.id}
                        sourceUrl={sourceUrl}
                        notificationId={isSynthesized ? null : item.id}
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
