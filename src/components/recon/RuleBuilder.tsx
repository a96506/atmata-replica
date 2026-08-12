"use client";

import * as React from "react";
import { toast } from "@/components/toast";
import { loadRules, saveRules, type ReconRule } from "./StatementImporter";

/**
 * RuleBuilder — declarative reconciliation rule editor.
 * Stored in sessionStorage so rules survive within the demo session.
 */

export function RuleBuilder() {
  const [rules, setRules] = React.useState<ReconRule[]>([]);
  const [refContains, setRefContains] = React.useState("");
  const [amountMin, setAmountMin] = React.useState("");
  const [amountMax, setAmountMax] = React.useState("");
  const [targetDocId, setTargetDocId] = React.useState("");

  React.useEffect(() => {
    setRules(loadRules());
  }, []);

  const addRule = () => {
    if (!targetDocId.trim()) {
      toast.error("Target doc id is required.");
      return;
    }
    if (!refContains.trim() && !amountMin && !amountMax) {
      toast.error("Add at least one condition (ref or amount range).");
      return;
    }
    const next: ReconRule = {
      id: `rule_${Date.now()}`,
      refContains: refContains.trim() || undefined,
      amountMin: amountMin ? Number(amountMin) : undefined,
      amountMax: amountMax ? Number(amountMax) : undefined,
      targetDocId: targetDocId.trim(),
    };
    const all = [...rules, next];
    setRules(all);
    saveRules(all);
    setRefContains("");
    setAmountMin("");
    setAmountMax("");
    setTargetDocId("");
    toast.success("Rule added (demo).");
    // eslint-disable-next-line no-console
    console.info("atmata:event", "recon.rule.added", next);
  };

  const removeRule = (id: string) => {
    const next = rules.filter((r) => r.id !== id);
    setRules(next);
    saveRules(next);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-semibold text-foreground">New rule</div>
        <p className="mt-1 text-xs text-muted-foreground">
          If <em>reference contains</em> AND <em>amount in [min, max]</em> → propose match to <em>target doc</em>.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Field label="Reference contains">
            <input
              type="text"
              value={refContains}
              onChange={(e) => setRefContains(e.target.value)}
              placeholder="e.g. PCG/2026"
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label="Amount min">
            <input
              type="number"
              step="any"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder="(optional)"
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label="Amount max">
            <input
              type="number"
              step="any"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder="(optional)"
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label="Target doc id">
            <input
              type="text"
              value={targetDocId}
              onChange={(e) => setTargetDocId(e.target.value)}
              placeholder="e.g. bill_1 / inv_1"
              className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={addRule}
            className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary"
          >
            Add rule
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Active rules ({rules.length})
        </div>
        {rules.length === 0 ? (
          <div className="rounded-md border border-dashed border-input bg-muted/50 p-4 text-sm text-muted-foreground">
            No rules yet. Add one above, then import a statement to see suggested matches.
          </div>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-sm"
              >
                <div className="text-foreground">
                  {r.refContains ? (
                    <span>
                      ref contains <span className="font-mono">{`"${r.refContains}"`}</span>
                    </span>
                  ) : null}
                  {r.refContains && (r.amountMin !== undefined || r.amountMax !== undefined) ? " · " : ""}
                  {r.amountMin !== undefined || r.amountMax !== undefined ? (
                    <span>
                      amount ∈ [{r.amountMin ?? "−∞"}, {r.amountMax ?? "+∞"}]
                    </span>
                  ) : null}
                  {" → "}
                  <span className="font-mono">{r.targetDocId}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeRule(r.id)}
                  className="cursor-pointer text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
