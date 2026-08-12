import { Link } from "@/i18n/navigation";
import { DataTable } from "@/components/data-table";
import { DEMO_RECON_SUGGESTIONS } from "@/lib/demo-data";
import { ReconDemoActions } from "./recon-demo-actions";

function confidenceBadge(v: number) {
  const pct = (v * 100).toFixed(0);
  if (v >= 0.9)
    return <span className="rounded bg-status-success-muted px-2 py-0.5 text-xs font-medium text-status-success-foreground">{pct}%</span>;
  if (v >= 0.7)
    return <span className="rounded bg-status-pending-muted px-2 py-0.5 text-xs font-medium text-status-pending-foreground">{pct}%</span>;
  return <span className="rounded bg-status-danger-muted px-2 py-0.5 text-xs font-medium text-destructive">{pct}%</span>;
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
  const { id } = await params;
  const data = {
    session_id: Number(id) || 1,
    suggestions: DEMO_RECON_SUGGESTIONS,
    total: DEMO_RECON_SUGGESTIONS.length,
    page: 1,
    limit: 20,
  };

  const rows = data.suggestions.map((s) => [
    <span key="ref" className="font-medium text-foreground">
      {s.bank_ref || `#${s.bank_line_id}`}
    </span>,
    <span key="amt" className="tabular-nums">
      {s.bank_amount.toFixed(3)}
    </span>,
    s.matched_entry_ref || (s.matched_entry_id ? `#${s.matched_entry_id}` : "—"),
    <span key="mamt" className="tabular-nums">
      {s.matched_amount > 0 ? s.matched_amount.toFixed(3) : "—"}
    </span>,
    confidenceBadge(s.confidence),
    <span key="type" className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">
      {s.match_type}
    </span>,
    <ReconDemoActions
      key="actions"
      sessionId={id}
      bankLineId={s.bank_line_id}
      hasMatch={!!s.matched_entry_id}
    />,
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/accounting/reconciliation" className="text-sm text-foreground hover:underline">
          &larr; Reconciliation
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Session #{data.session_id}</h1>
        <p className="text-sm text-foreground">
          {data.total} suggestion{data.total !== 1 ? "s" : ""} · Page {data.page}
        </p>
      </header>

      <DataTable columns={COLUMNS} rows={rows} emptyMessage="No suggestions for this session." />
    </div>
  );
}
