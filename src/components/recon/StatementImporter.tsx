"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { insforge } from "@/lib/insforge/client";
import {
  getMyCompanyId,
  importBankStatementAction,
  listBankAccounts,
  listBankStatementLines,
} from "@/lib/actions/reconciliation";
import { requestReconciliationSuggestions } from "@/lib/actions/ai";
import type { ReconciliationSuggestion } from "@/types/functions";

/**
 * StatementImporter — parse CSV client-side, optionally upload to `imports`,
 * then call `import_bank_statement` in one shot (no table DML).
 *
 * Expected CSV header (case-insensitive):
 *   date, description, [reference], amount
 */

export type StatementRow = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
};

type ParsedLine = {
  lineNumber: number;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
};

function parseCsv(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (k: string) => header.indexOf(k);
  const di = idx("date");
  const desci = idx("description");
  const refi = idx("reference");
  const ami = idx("amount");
  if (di < 0 || desci < 0 || ami < 0) {
    throw new Error(
      "CSV header must include: date, description, [reference], amount",
    );
  }
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    return {
      lineNumber: i + 1,
      date: cells[di] ?? "",
      description: cells[desci] ?? "",
      reference: refi >= 0 ? cells[refi] || null : null,
      amount: Number(cells[ami] ?? "0") || 0,
    };
  });
}

function safeFileName(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/[^\p{L}\p{N}._-]/gu, "_");
}

export function StatementImporter() {
  const locale = useLocale();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());

  const [bankAccounts, setBankAccounts] = React.useState<
    Array<{ id: string; name: string; currency: string }>
  >([]);
  const [bankAccountId, setBankAccountId] = React.useState<string>("");
  const [statementNumber, setStatementNumber] = React.useState<string>("");
  const [rows, setRows] = React.useState<StatementRow[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [statementId, setStatementId] = React.useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = React.useState<
    Map<string, ReconciliationSuggestion>
  >(new Map());
  const [suggesting, setSuggesting] = React.useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

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
      const parsed = parseCsv(csvText);
      if (parsed.length === 0) {
        toast.error("CSV contained no statement lines.");
        return;
      }

      const number =
        statementNumber || `STMT-${new Date().toISOString().slice(0, 10)}`;
      const companyId = await getMyCompanyId();
      const uploadId = crypto.randomUUID();
      const objectKey = `${companyId}/bank_statements/${uploadId}/${safeFileName(file.name)}`;

      const { data: uploadData, error: uploadError } = await insforge.storage
        .from("imports")
        .upload(objectKey, file);
      if (uploadError) throw new Error(uploadError.message);

      const result = await importBankStatementAction({
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        header: {
          bankAccountId,
          number,
        },
        lines: parsed.map((p) => ({
          lineNumber: p.lineNumber,
          date: p.date,
          description: p.description,
          reference: p.reference,
          amount: p.amount,
        })),
        attachment: {
          key: uploadData?.key ?? objectKey,
          url: uploadData?.url ?? "",
          filename: file.name,
          mime: file.type || "text/csv",
          size: file.size,
        },
      });

      if (!result.ok) {
        toast.error(result.error.messageKey || result.error.code);
        return;
      }

      idempotencyKeyRef.current = crypto.randomUUID();
      const payload = result.data as { statementId?: string; lineCount?: number };
      if (payload.statementId) {
        setStatementId(payload.statementId);
      }
      toast.success(
        `Imported ${payload.lineCount ?? parsed.length} statement line${
          (payload.lineCount ?? parsed.length) === 1 ? "" : "s"
        }.`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const requestAiMatches = async () => {
    if (!statementId) return;
    setSuggesting(true);
    const result = await requestReconciliationSuggestions({
      statementId,
      lineIds: rows.map((row) => row.id),
    });
    setSuggesting(false);
    if (!result.ok) {
      toast.error("AI matching failed. Try again.");
      return;
    }
    setAiSuggestions(
      new Map(result.data.map((suggestion) => [suggestion.lineId, suggestion])),
    );
    toast.success(`Generated ${result.data.length} AI match suggestions.`);
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
            . Parsed in-browser; imported via{" "}
            <span className="font-mono">import_bank_statement</span>.
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
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void requestAiMatches()}
            disabled={!statementId || suggesting}
            className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggesting ? "Finding matches…" : "Suggest AI matches"}
          </button>
        </div>
      ) : null}

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
                const aiMatch = aiSuggestions.get(r.id);
                const match = aiMatch
                  ? {
                      docId:
                        aiMatch.sourceDocId ??
                        aiMatch.journalEntryId ??
                        "candidate",
                      reason: aiMatch.reason,
                      confidence: aiMatch.confidence,
                    }
                  : undefined;
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
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            AI proposal · review only
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No suggestion
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
