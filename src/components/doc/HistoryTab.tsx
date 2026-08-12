import type { AuditEvent } from "@/types";

export function HistoryTab({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return <div className="text-sm text-muted-foreground">No audit events recorded yet.</div>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 border-l-2 border-primary/30 pl-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-foreground">
              <span className="text-muted-foreground">
                {e.fromState ? `${e.fromState} → ` : "created → "}
              </span>
              <span className="font-medium">{e.toState}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(e.at).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" · "}by {e.by}
            </div>
            {e.reason ? (
              <div className="mt-0.5 text-xs text-foreground">{e.reason}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
