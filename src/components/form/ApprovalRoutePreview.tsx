import { resolveApprovalChain } from "@/mocks/seed/approvals";
import { formatMoney } from "@/lib/money";
import type { Currency, DocType } from "@/types";

export function ApprovalRoutePreview({
  docType,
  amount,
  currency = "KWD",
}: {
  docType: DocType;
  amount: number;
  currency?: Currency;
}) {
  const chain = resolveApprovalChain(docType, amount);
  if (chain.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
        No approval rule matches — will auto-confirm on submit.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-status-info-border bg-status-info-muted p-2 text-xs text-status-info-foreground">
      <span className="font-medium">On submit, route to:</span>{" "}
      {chain.map((r, i) => (
        <span key={r.id}>
          {i > 0 ? " → " : ""}
          {r.approverName}
          {r.minAmount > 0 ? (
            <span className="text-status-info-foreground">
              {" "}
              (≥ {formatMoney(r.minAmount, currency)})
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
