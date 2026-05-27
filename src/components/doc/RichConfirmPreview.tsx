import type { ReactNode } from "react";

/**
 * Structured preview body used inside `useConfirm({ description: ... })`.
 * Pass as React node when the consumer supports it, or as plain text for
 * the existing confirm-dialog signature.
 */
export type RichConfirmRow = {
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
};

const TONE: Record<string, string> = {
  default: "text-slate-700",
  good: "text-emerald-700",
  bad: "text-red-700",
  warn: "text-amber-700",
};

export function RichConfirmPreview({
  intro,
  rows,
  warnings,
}: {
  intro?: ReactNode;
  rows: RichConfirmRow[];
  warnings?: string[];
}) {
  return (
    <div className="space-y-3 text-sm">
      {intro ? <div className="text-slate-700">{intro}</div> : null}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map((r) => (
            <span key={r.label} className="contents">
              <dt className="text-xs text-slate-500">{r.label}</dt>
              <dd className={"text-xs font-medium tabular-nums " + (TONE[r.tone ?? "default"])}>
                {r.value}
              </dd>
            </span>
          ))}
        </dl>
      </div>
      {warnings?.length ? (
        <ul className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Render a `RichConfirmPreview`'s data as a plain string for fallback text dialogs. */
export function richConfirmText(rows: RichConfirmRow[], warnings?: string[]): string {
  const body = rows.map((r) => `${r.label}: ${typeof r.value === "string" || typeof r.value === "number" ? r.value : "(see UI)"}`).join("\n");
  return warnings?.length ? body + "\n\nWarnings:\n" + warnings.map((w) => "• " + w).join("\n") : body;
}
