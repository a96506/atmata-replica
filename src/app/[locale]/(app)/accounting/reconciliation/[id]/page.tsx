import { Link } from "@/i18n/navigation";
import { DataTable } from "@/components/data-table";
import { Empty } from "@/components/state/Empty";
import {
  getBankStatement,
  listSuggestedMatches,
} from "@/lib/api/reconciliation";
import { ReconLineActions } from "./recon-demo-actions";

function confidenceBadge(v: number) {
  const pct = (v * 100).toFixed(0);
  if (v >= 0.9)
    return (
      <span className="rounded bg-status-success-muted px-2 py-0.5 text-xs font-medium text-status-success-foreground">
        {pct}%
      </span>
    );
  if (v >= 0.7)
    return (
      <span className="rounded bg-status-pending-muted px-2 py-0.5 text-xs font-medium text-status-pending-foreground">
        {pct}%
      </span>
    );
  return (
    <span className="rounded bg-status-danger-muted px-2 py-0.5 text-xs font-medium text-destructive">
      {pct}%
    </span>
  );
}

const COLUMNS = [
  { key: "bank_ref", label: "Bank ref" },
  { key: "bank_amount", label: "Amount", className: "text-right" },
  { key: "match", label: "Matched entry" },
  { key: "match_amount", label: "Entry amount", className: "text-right" },
  { key: "confidence", label: "Confidence" },
  { key: "type", label: "Type" },
  { key: "actions", label: "", className: "text-right" },
];

export default async function ReconciliationWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: statementId } = await params;
  const statement = await getBankStatement(statementId).catch(() => null);
  const suggestions = statement
    ? await listSuggestedMatches(statementId).catch(() => [])
    : [];

  const rows = suggestions.map((s) => [
    <span key="ref" className="font-medium text-foreground">
      {s.bankRef}
    </span>,
    <span key="amt" className="tabular-nums">
      {s.bankAmount.toFixed(3)}
    </span>,
    s.matchedEntryRef || (s.matchedEntryId ? `#${s.matchedEntryId}` : "—"),
    <span key="mamt" className="tabular-nums">
      {s.matchedAmount > 0 ? s.matchedAmount.toFixed(3) : "—"}
    </span>,
    confidenceBadge(s.confidence),
    <span
      key="type"
      className="rounded bg-muted px-2 py-0.5 text-xs text-foreground"
    >
      {s.matchType}
    </span>,
    <ReconLineActions
      key="actions"
      matchId={s.matchId}
      lineId={s.lineId}
    />,
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/accounting/reconciliation"
          className="text-sm text-foreground hover:underline"
        >
          &larr; Reconciliation
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {statement
            ? `Statement ${statement.number}`
            : `Statement ${statementId}`}
        </h1>
        <p className="text-sm text-foreground">
          {statement ? (
            <>
              Status: {statement.status}
              {statement.periodStart || statement.periodEnd
                ? ` · ${statement.periodStart ?? "?"} → ${statement.periodEnd ?? "?"}`
                : null}
              {" · "}
              {suggestions.length} suggestion
              {suggestions.length !== 1 ? "s" : ""}
            </>
          ) : (
            "Bank statement not found."
          )}
        </p>
      </header>

      {!statement ? (
        <Empty
          title="Statement not found"
          description="Open a statement from the reconciliation list. The URL id is the bank_statement_id."
        />
      ) : suggestions.length === 0 ? (
        <Empty
          title="No suggested matches"
          description="Run matching rules or wait for suggestions on unmatched lines."
        />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          emptyMessage="No suggestions for this statement."
        />
      )}
    </div>
  );
}
