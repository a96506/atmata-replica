"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";
import type { Currency, DocType } from "@/types";

type ApprovalRuleRow = {
  id: string;
  docType: string;
  minAmount: number;
  maxAmount: number | null;
  approverRoles: string[];
  sequence: number;
  active: boolean;
};

function resolveChain(
  rules: ApprovalRuleRow[],
  docType: string,
  amount: number,
): ApprovalRuleRow[] {
  return rules
    .filter(
      (r) =>
        r.active &&
        r.docType === docType &&
        amount >= r.minAmount &&
        (r.maxAmount == null || amount <= r.maxAmount),
    )
    .sort((a, b) => a.sequence - b.sequence || a.minAmount - b.minAmount);
}

export function ApprovalRoutePreview({
  docType,
  amount,
  currency = "KWD",
}: {
  docType: DocType;
  amount: number;
  currency?: Currency;
}) {
  const [rules, setRules] = useState<ApprovalRuleRow[]>([]);
  const t = useTranslations("documents.approvalPreview");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/approval-rules", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { rules?: ApprovalRuleRow[] }) => {
        if (!cancelled) setRules(body.rules ?? []);
      })
      .catch(() => {
        if (!cancelled) setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chain = resolveChain(rules, docType, amount);
  if (chain.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
        {t("noRule")}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-status-info-border bg-status-info-muted p-2 text-xs text-status-info-foreground">
      <span className="font-medium">{t("routeTo")}</span>{" "}
      {chain.map((r, i) => (
        <span key={r.id}>
          {i > 0 ? " → " : ""}
          {(r.approverRoles ?? []).join(" / ")}
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
