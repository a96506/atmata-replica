"use client";

import * as React from "react";
import { toast } from "@/components/toast";

/**
 * StatementImporter — accepts a CSV upload, parses it client-side, and shows
 * a preview table. Rules from RuleBuilder are applied to surface suggested
 * matches. Toast-only persistence.
 *
 * Expected CSV header (case-insensitive):
 *   date,description,reference,amount
 */

export type StatementRow = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  /** Suggested match found by applying rules (if any). */
  match?: { docId: string; reason: string; confidence: number };
};

export type ReconRule = {
  id: string;
  refContains?: string;
  amountMin?: number;
  amountMax?: number;
  /** Suggested target doc id when this rule matches. */
  targetDocId: string;
};

const RULES_KEY = "atmata.recon.rules";

export function loadRules(): ReconRule[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(RULES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRules(rules: ReconRule[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}

function applyRules(row: StatementRow, rules: ReconRule[]): StatementRow["match"] {
  for (const r of rules) {
    const okRef = r.refContains
      ? row.reference.toLowerCase().includes(r.refContains.toLowerCase()) ||
        row.description.toLowerCase().includes(r.refContains.toLowerCase())
      : true;
    const okAmtMin = r.amountMin === undefined ? true : Math.abs(row.amount) >= r.amountMin;
    const okAmtMax = r.amountMax === undefined ? true : Math.abs(row.amount) <= r.amountMax;
    if (okRef && okAmtMin && okAmtMax) {
      return {
        docId: r.targetDocId,
        reason: `rule ${r.id}${r.refContains ? `: ref contains "${r.refContains}"` : ""}`,
        confidence: r.refContains ? 0.85 : 0.6,
      };
    }
  }
  return undefined;
}

function parseCsv(text: string): StatementRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (k: string) => header.indexOf(k);
  const di = idx("date");
  const desci = idx("description");
  const refi = idx("reference");
  const ami = idx("amount");
  if (di < 0 || desci < 0 || ami < 0) {
    throw new Error("CSV header must include: date, description, [reference], amount");
  }
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    return {
      id: `r_${i + 1}`,
      date: cells[di] ?? "",
      description: cells[desci] ?? "",
      reference: refi >= 0 ? cells[refi] ?? "" : "",
      amount: Number(cells[ami] ?? "0") || 0,
    };
  });
}

export function StatementImporter() {
  const [rows, setRows] = React.useState<StatementRow[]>([]);
  const [rules, setRules] = React.useState<ReconRule[]>([]);

  React.useEffect(() => {
    setRules(loadRules());
  }, []);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onCsv(file);
    e.target.value = "";
  };

  const onCsv = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = parseCsv(text);
      const withMatches = parsed.map((r) => ({ ...r, match: applyRules(r, rules) }));
      setRows(withMatches);
      toast.success(`Parsed ${withMatches.length} row${withMatches.length === 1 ? "" : "s"}.`);
      // eslint-disable-next-line no-console
      console.info("atmata:event", "recon.statement.imported", {
        rows: withMatches.length,
        matched: withMatches.filter((r) => r.match).length,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const acceptMatch = (row: StatementRow) => {
    toast.success(`Match accepted (demo): ${row.reference || row.description} → ${row.match!.docId}`);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    // eslint-disable-next-line no-console
    console.info("atmata:event", "recon.match.accepted", { docId: row.match!.docId });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-input bg-card p-4">
        <label className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-foreground">Import bank statement CSV</span>
          <span className="text-xs text-muted-foreground">
            Expected header: <span className="font-mono">date, description, [reference], amount</span>. Parsed in-browser; no upload to server.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="block w-full cursor-pointer rounded-md border border-input bg-card px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary"
          />
        </label>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Suggested match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{r.description}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.reference}</td>
                  <td
                    className={
                      "px-4 py-3 text-right tabular-nums " +
                      (r.amount < 0 ? "text-destructive" : "text-status-success-foreground")
                    }
                  >
                    {r.amount.toFixed(3)}
                  </td>
                  <td className="px-4 py-3">
                    {r.match ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-status-success-muted px-2 py-0.5 font-mono text-xs text-status-success-foreground">
                          → {r.match.docId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(r.match.confidence * 100)}% · {r.match.reason}
                        </span>
                        <button
                          type="button"
                          onClick={() => acceptMatch(r)}
                          className="cursor-pointer rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:bg-primary"
                        >
                          Accept
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No rule matched</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
