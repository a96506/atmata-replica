import { getTranslations } from "next-intl/server";
import type { AuditEvent } from "@/types";

function actorLabel(e: AuditEvent): string {
  const actor = e.actor;
  if (actor?.fullName?.trim()) return actor.fullName.trim();
  if (actor?.email?.trim()) return actor.email.trim();
  // Last-resort fallback: never show the raw UUID — surface a neutral marker.
  return "—";
}

/** Format a change_detail payload as a single human-readable line. */
function changeDetailLabel(
  e: AuditEvent,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string | null {
  const detail = e.changeDetail;
  if (!detail || typeof detail !== "object") return null;
  const eventType = e.eventType;
  if (eventType === "field_change") {
    const oldVal = "old" in detail ? String(detail.old ?? "") : "";
    const newVal = "new" in detail ? String(detail.new ?? "") : "";
    const field = "field" in detail ? String(detail.field ?? "") : "";
    if (field) {
      return t("fieldChange", { field, old: oldVal, new: newVal });
    }
    return t("valueChange", { old: oldVal, new: newVal });
  }
  if (eventType === "attachment_added" || eventType === "attachment_removed") {
    const name =
      "name" in detail ? String(detail.name ?? "") :
      "filename" in detail ? String(detail.filename ?? "") :
      "key" in detail ? String(detail.key ?? "") : "";
    return eventType === "attachment_added"
      ? t("attachmentAdded", { name: name || "—" })
      : t("attachmentRemoved", { name: name || "—" });
  }
  // Unknown event_type with a payload — render a compact JSON-ish summary.
  const entries = Object.entries(detail)
    .filter(([k]) => k !== "old" && k !== "new")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
  return entries ? entries : null;
}

export async function HistoryTab({ events }: { events: AuditEvent[] }) {
  const t = await getTranslations("documents.history");
  if (events.length === 0) {
    return <div className="text-sm text-muted-foreground">{t("empty")}</div>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const isTransition =
          (!e.eventType || e.eventType === "state_transition") &&
          (e.fromState || e.toState);
        const detailLabel = changeDetailLabel(e, t);
        return (
          <li key={e.id} className="flex items-start gap-3 border-s-2 border-primary/30 ps-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">
                {isTransition ? (
                  <>
                    <span className="text-muted-foreground">
                      {e.fromState ? `${e.fromState} → ` : t("created")}
                    </span>
                    <span className="font-medium">{e.toState}</span>
                  </>
                ) : e.eventType === "attachment_added" ? (
                  <span className="font-medium">{t("attachmentAddedBadge")}</span>
                ) : e.eventType === "attachment_removed" ? (
                  <span className="font-medium">{t("attachmentRemovedBadge")}</span>
                ) : (
                  <span className="font-medium">{e.eventType ?? t("event")}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(e.at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                {t("by")} {actorLabel(e)}
              </div>
              {detailLabel ? (
                <div className="mt-0.5 text-xs text-foreground">{detailLabel}</div>
              ) : null}
              {e.reason ? (
                <div className="mt-0.5 text-xs text-foreground">{e.reason}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
