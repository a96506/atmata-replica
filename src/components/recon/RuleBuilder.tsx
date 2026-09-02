"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  deleteReconciliationRuleAction,
  listReconciliationRules,
  upsertReconciliationRuleAction,
} from "@/lib/actions/reconciliation";

type RuleRow = {
  id: string;
  name: string;
  matchType: string;
  conditions: Record<string, unknown>;
  action: Record<string, unknown>;
  active: boolean;
};

/**
 * RuleBuilder — persists reconciliation rules via upsert_reconciliation_rule.
 */

export function RuleBuilder() {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const actionToast = useActionToast();
  const t = useTranslations("accounting.recon");
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());

  const [rules, setRules] = React.useState<RuleRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [refContains, setRefContains] = React.useState("");
  const [amountMin, setAmountMin] = React.useState("");
  const [amountMax, setAmountMax] = React.useState("");
  const [targetDocId, setTargetDocId] = React.useState("");

  const reload = React.useCallback(async () => {
    try {
      const rows = await listReconciliationRules();
      setRules(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const addRule = async () => {
    if (!targetDocId.trim()) {
      toast.error(t("targetDocRequired"));
      return;
    }
    if (!refContains.trim() && !amountMin && !amountMax) {
      toast.error(t("conditionRequired"));
      return;
    }

    const hasRef = Boolean(refContains.trim());
    const hasAmt = Boolean(amountMin || amountMax);
    const matchType =
      hasRef && hasAmt ? "compound" : hasRef ? "reference" : "amount";

    const conditions: Record<string, unknown> = {};
    if (hasRef) conditions.refContains = refContains.trim();
    if (amountMin) conditions.amountMin = Number(amountMin);
    if (amountMax) conditions.amountMax = Number(amountMax);

    const nameParts: string[] = [];
    if (hasRef) nameParts.push(`ref:${refContains.trim()}`);
    if (amountMin || amountMax) {
      nameParts.push(`amt:[${amountMin || "−∞"},${amountMax || "+∞"}]`);
    }
    nameParts.push(`→${targetDocId.trim()}`);

    setPending(true);
    try {
      const result = await upsertReconciliationRuleAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        rule: {
          name: nameParts.join(" "),
          matchType,
          conditions,
          action: { targetDocId: targetDocId.trim() },
          active: true,
        },
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      idempotencyKeyRef.current = crypto.randomUUID();
      setRefContains("");
      setAmountMin("");
      setAmountMax("");
      setTargetDocId("");
      toast.success(t("ruleSaved"));
      await reload();
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  const removeRule = async (id: string) => {
    setPending(true);
    try {
      const result = await deleteReconciliationRuleAction({
        locale: writeLocale,
        idempotencyKey: crypto.randomUUID(),
        ruleId: id,
      });
      if (!result.ok) {
        actionToast.error(result.error);
        return;
      }
      toast.success(t("ruleRemoved"));
      await reload();
      router.refresh();
    } catch {
      actionToast.network();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-semibold text-foreground">{t("newRule")}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("newRuleHint")}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label={t("refContains")}>
            <input
              type="text"
              value={refContains}
              onChange={(e) => setRefContains(e.target.value)}
              placeholder={t("placeholderRef")}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
              disabled={pending}
            />
          </Field>
          <Field label={t("amountMin")}>
            <input
              type="number"
              step="any"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder={t("optional")}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
              disabled={pending}
            />
          </Field>
          <Field label={t("amountMax")}>
            <input
              type="number"
              step="any"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder={t("optional")}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
              disabled={pending}
            />
          </Field>
          <Field label={t("targetDocId")}>
            <input
              type="text"
              value={targetDocId}
              onChange={(e) => setTargetDocId(e.target.value)}
              placeholder={t("placeholderTarget")}
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
              disabled={pending}
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void addRule()}
            disabled={pending}
            className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-50"
          >
            {t("addRule")}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("activeRules", { count: rules.length })}
        </div>
        {loading ? (
          <div className="rounded-md border border-dashed border-input bg-muted/50 p-4 text-sm text-muted-foreground">
            {t("loadingRules")}
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-md border border-dashed border-input bg-muted/50 p-4 text-sm text-muted-foreground">
            {t("noRules")}
          </div>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => {
              const conditions = r.conditions ?? {};
              const ref =
                typeof conditions.refContains === "string"
                  ? conditions.refContains
                  : undefined;
              const amtMin =
                typeof conditions.amountMin === "number"
                  ? conditions.amountMin
                  : undefined;
              const amtMax =
                typeof conditions.amountMax === "number"
                  ? conditions.amountMax
                  : undefined;
              const target =
                typeof r.action?.targetDocId === "string"
                  ? r.action.targetDocId
                  : r.name;
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-sm"
                >
                  <div className="text-foreground">
                    {ref ? (
                      <span>
                        {t("refContainsLabel")}{" "}
                        <span className="font-mono">{`"${ref}"`}</span>
                      </span>
                    ) : null}
                    {ref && (amtMin !== undefined || amtMax !== undefined)
                      ? " · "
                      : ""}
                    {amtMin !== undefined || amtMax !== undefined ? (
                      <span>
                        {t("amountIn", {
                          min: amtMin ?? "−∞",
                          max: amtMax ?? "+∞",
                        })}
                      </span>
                    ) : null}
                    {" → "}
                    <span className="font-mono">{target}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeRule(r.id)}
                    disabled={pending}
                    className="cursor-pointer text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    {t("remove")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
