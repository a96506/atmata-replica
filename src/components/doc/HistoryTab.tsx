import type { AuditEvent } from "@/types";

export function HistoryTab({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return <div className="text-sm text-slate-500">No audit events recorded yet.</div>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 border-l-2 border-orange-200 pl-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-900">
              <span className="text-slate-500">
                {e.fromState ? `${e.fromState} → ` : "created → "}
              </span>
              <span className="font-medium">{e.toState}</span>
            </div>
            <div className="text-xs text-slate-500">
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
              <div className="mt-0.5 text-xs text-slate-700">{e.reason}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
