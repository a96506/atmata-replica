"use client";

import * as React from "react";
import { toast } from "@/components/toast";
import { insforge } from "@/lib/insforge/client";
import {
  createBankStatement,
  linkBankStatementSource,
  listBankAccounts,
  listBankStatementLines,
} from "@/lib/actions/reconciliation";

/**
 * StatementImporter — uploads a bank statement CSV to the `imports` bucket,
 * parses it server-side, and inserts `bank_statement_lines` rows. The
 * preview table reads from the DB (not in-memory) after upload.
 *
 * Expected CSV header (case-insensitive):
 *   date, description, [reference], amount
 *
 * Rule-based match suggestions stay client-side for now; AI match ships in
 * the `functions` todo.
 */

export type StatementRow = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
};

export type ReconRule = {
  id: string;
  refContains?: string;
  amountMin?: number;
  amountMax?: number;
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

function applyRules(row: StatementRow, rules: ReconRule[]) {
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

function safeFileName(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/[^\p{L}\p{N}._-]/gu, "_");
}

export function StatementImporter() {
  const [bankAccounts, setBankAccounts] = React.useState<
    Array<{ id: string; name: string; currency: string }>
  >([]);
  const [bankAccountId, setBankAccountId] = React.useState<string>("");
  const [statementNumber, setStatementNumber] = React.useState<string>("");
  const [rows, setRows] = React.useState<StatementRow[]>([]);
  const [rules, setRules] = React.useState<ReconRule[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [statementId, setStatementId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const accounts = await listBankAccounts();
        setBankAccounts(accounts);
        if (accounts.length > 0 && !bankAccountId) {
          setBankAccountId(accounts[0].id);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  React.useEffect(() => {
    setRules(loadRules());
  }, []);

  // When a statement has been imported, refetch its lines from the DB.
  React.useEffect(() => {
    if (!statementId) return;
    void (async () => {
      try {
        const lines = await listBankStatementLines({ statementId });
        setRows(
          lines.map((l) => ({
            id: l.id,
            date: l.date,
            description: l.description,
            reference: l.reference ?? "",
            amount: l.amount,
          })),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [statementId]);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!bankAccountId) {
      toast.error("Select a bank account first.");
      return;
    }
    setUploading(true);
    try {
      const csvText = await file.text();
      const number =
        statementNumber || `STMT-${new Date().toISOString().slice(0, 10)}`;
      const { statementId: sid, companyId } = await createBankStatement({
        bankAccountId,
        number,
      });
      const objectKey = `${companyId}/bank_statements/${sid}/${safeFileName(file.name)}`;
      const { data, error } = await insforge.storage
        .from("imports")
        .upload(objectKey, file);
      if (error) throw new Error(error.message);
      const { lines } = await linkBankStatementSource({
        statementId: sid,
        key: data?.key ?? objectKey,
        url: data?.url ?? "",
        csvText,
      });
      setStatementId(sid);
      toast.success(`Imported ${lines} statement line${lines === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const acceptMatch = (row: StatementRow) => {
    const match = applyRules(row, rules);
    if (!match) return;
    toast.success(
      `Match accepted (demo): ${row.reference || row.description} → ${match.docId}`,
    );
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-input bg-card p-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex-1 text-sm text-foreground">
            <span className="mb-1 block font-medium">Bank account</span>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
                  className="block w-full cursor-pointer rounded-md border border-input bg-card px-3 py-2 text-sm"
              disabled={uploading || bankAccounts.length === 0}
            >
              {bankAccounts.length === 0 ? (
                <option value="">No bank accounts</option>
              ) : (
                bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex-1 text-sm text-foreground">
            <span className="mb-1 block font-medium">Statement number</span>
            <input
              type="text"
              value={statementNumber}
              onChange={(e) => setStatementNumber(e.target.value)}
              placeholder={`STMT-${new Date().toISOString().slice(0, 10)}`}
              className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              disabled={uploading}
            />
          </label>
        </div>
        <label className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-foreground">
            Import bank statement CSV
          </span>
          <span className="text-xs text-muted-foreground">
            Expected header:{" "}
            <span className="font-mono">
              date, description, [reference], amount
            </span>
            . Parsed server-side; rows stored in `bank_statement_lines`.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              void onUpload(f);
              e.target.value = "";
            }}
            className="block w-full cursor-pointer rounded-md border border-input bg-card px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary disabled:opacity-50"
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
              {rows.map((r) => {
                const match = applyRules(r, rules);
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{r.date}</td>
                    <td className="px-4 py-3">{r.description}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.reference}</td>
                    <td
                      className={
                        "px-4 py-3 text-right tabular-nums " +
                        (r.amount < 0
                          ? "text-destructive"
                          : "text-status-success-foreground")
                      }
                    >
                      {r.amount.toFixed(3)}
                    </td>
                    <td className="px-4 py-3">
                      {match ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-status-success-muted px-2 py-0.5 font-mono text-xs text-status-success-foreground">
                            → {match.docId}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(match.confidence * 100)}% ·{" "}
                            {match.reason}
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
                        <span className="text-xs text-muted-foreground">
                          No rule matched
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
