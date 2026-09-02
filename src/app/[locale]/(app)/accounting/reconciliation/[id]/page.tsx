import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("accounting.recon");

  const columns = [
    { key: "bank_ref", label: t("colBankRef") },
    { key: "bank_amount", label: t("colAmount"), className: "text-right" },
    { key: "match", label: t("colMatchedEntry") },
    { key: "match_amount", label: t("colEntryAmount"), className: "text-right" },
    { key: "confidence", label: t("colConfidence") },
    { key: "type", label: t("colType") },
    { key: "actions", label: "", className: "text-right" },
  ];

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
          {t("back")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {t("statementTitle", {
            number: statement ? statement.number : statementId,
          })}
        </h1>
        <p className="text-sm text-foreground">
          {statement ? (
            <>
              {t("statusLine", { status: statement.status })}
              {statement.periodStart || statement.periodEnd
                ? ` · ${t("periodRange", {
                    start: statement.periodStart ?? "?",
                    end: statement.periodEnd ?? "?",
                  })}`
                : null}
              {" · "}
              {t("suggestionCount", { count: suggestions.length })}
            </>
          ) : (
            t("notFoundBody")
          )}
        </p>
      </header>

      {!statement ? (
        <Empty
          title={t("notFoundTitle")}
          description={t("notFoundDescription")}
        />
      ) : suggestions.length === 0 ? (
        <Empty
          title={t("noMatchesTitle")}
          description={t("noMatchesDescription")}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyMessage={t("emptySuggestions")}
        />
      )}
    </div>
  );
}
