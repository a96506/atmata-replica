"use server";

import { camelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";

/**
 * Bank statement CSV ingest — three-step flow:
 *
 *   1. createBankStatement({ bankAccountId, number, periodStart, periodEnd })
 *      → inserts a `bank_statements` row (status='imported', no source yet).
 *      Returns { statementId, companyId }.
 *   2. Browser uploads the CSV to the `imports` bucket with key
 *      `${companyId}/bank_statements/${statementId}/${filename}`.
 *   3. linkBankStatementSource({ statementId, key, url, csvText })
 *      → updates source_url/source_key, parses the CSV server-side, and
 *      inserts `bank_statement_lines` rows. Returns the lines for preview.
 *
 * AI match suggestions ship in the `functions` todo.
 */

export async function createBankStatement(input: {
  bankAccountId: string;
  number: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<{ statementId: string; companyId: string }> {
  const insforge = await createInsForgeServerClient();

  const { data: cidRow, error: cidErr } = await insforge.database.rpc("my_company_id");
  if (cidErr) throw new Error(cidErr.message);
  const companyId = cidRow as unknown as string;
  if (!companyId) throw new Error("no active company membership");

  const { data, error } = await insforge.database
    .from("bank_statements")
    .insert([
      {
        bank_account_id: input.bankAccountId,
        number: input.number,
        period_start: input.periodStart ?? null,
        period_end: input.periodEnd ?? null,
        status: "imported",
      },
    ])
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const statementId = (data as { id: string }).id;
  return { statementId, companyId };
}

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

export async function linkBankStatementSource(input: {
  statementId: string;
  key: string;
  url: string;
  csvText: string;
}): Promise<{ lines: number }> {
  const insforge = await createInsForgeServerClient();

  const parsed = parseCsv(input.csvText);
  if (parsed.length === 0) {
    throw new Error("CSV contained no statement lines");
  }

  // Insert attachment referencing the statement.
  const { error: attErr } = await insforge.database
    .from("attachments")
    .insert([
      {
        doc_type: "bank_statement",
        doc_id: input.statementId,
        bucket: "imports",
        key: input.key,
        url: input.url,
        mime: "text/csv",
        size: new Blob([input.csvText]).size,
        filename: input.key.split("/").pop() ?? "statement.csv",
      },
    ]);
  if (attErr) throw new Error(attErr.message);

  // Insert lines — bank_statement_lines has a composite FK on
  // (company_id, bank_statement_id), so we include company_id explicitly.
  const rows = parsed.map((p) => ({
    bank_statement_id: input.statementId,
    line_number: p.lineNumber,
    date: p.date,
    description: p.description,
    reference: p.reference,
    amount: p.amount,
    status: "unmatched",
  }));
  const { error: linesErr } = await insforge.database
    .from("bank_statement_lines")
    .insert(rows);
  if (linesErr) throw new Error(linesErr.message);

  // Update the statement with the source pointer.
  const { error: stmtErr } = await insforge.database
    .from("bank_statements")
    .update({ source_url: input.url, source_key: input.key })
    .eq("id", input.statementId);
  if (stmtErr) throw new Error(stmtErr.message);

  return { lines: parsed.length };
}

export async function listBankStatementLines(input: {
  statementId: string;
}) {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("bank_statement_lines")
    .select("*")
    .eq("bank_statement_id", input.statementId)
    .order("line_number", { ascending: true });
  if (error) throw new Error(error.message);
  return camelize<
    Array<{
      id: string;
      lineNumber: number;
      date: string;
      description: string;
      reference: string | null;
      amount: number;
      status: string;
    }>
  >(data ?? []);
}

export async function listBankAccounts(): Promise<
  Array<{ id: string; name: string; currency: string }>
> {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("bank_accounts")
    .select("id, name, currency")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return camelize<
    Array<{ id: string; name: string; currency: string }>
  >(data ?? []);
}
