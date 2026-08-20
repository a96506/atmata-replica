"use server";

import { revalidatePath } from "next/cache";

import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import {
  acceptReconciliationMatchSchema,
  completeReconciliationSessionSchema,
  deleteReconciliationRuleSchema,
  importBankStatementSchema,
  manualReconciliationMatchSchema,
  rejectReconciliationMatchSchema,
  skipBankStatementLineSchema,
  upsertReconciliationRuleSchema,
} from "@/lib/actions/validation/reconciliation";
import { callWriteRpcJson } from "@/lib/actions/write-rpc";
import { camelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";

function revalidateReconciliationPaths(locale: "en" | "ar") {
  revalidatePath(`/${locale}/accounting/reconciliation`);
  revalidatePath(`/accounting/reconciliation`);
}

export async function getMyCompanyId(): Promise<string> {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("my_company_id");
  if (error) throw new Error(error.message);
  const companyId = data as unknown as string;
  if (!companyId) throw new Error("no active company membership");
  return companyId;
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

export async function listReconciliationRules(): Promise<
  Array<{
    id: string;
    name: string;
    priority: number;
    matchType: string;
    conditions: Record<string, unknown>;
    action: Record<string, unknown>;
    active: boolean;
  }>
> {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("reconciliation_rules")
    .select("id, name, priority, match_type, conditions, action, active")
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);
  return camelize(data ?? []);
}

export async function importBankStatementAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      importBankStatementSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("import_bank_statement", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_attachment: parsed.data.attachment ?? null,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function upsertReconciliationRuleAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      upsertReconciliationRuleSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("upsert_reconciliation_rule", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_rule: parsed.data.rule,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deleteReconciliationRuleAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      deleteReconciliationRuleSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("delete_reconciliation_rule", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_rule_id: parsed.data.ruleId,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function skipBankStatementLineAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      skipBankStatementLineSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("skip_bank_statement_line", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_line_id: parsed.data.lineId,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function manualReconciliationMatchAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      manualReconciliationMatchSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("manual_reconciliation_match", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_line_id: parsed.data.lineId,
      p_journal_entry_id: parsed.data.journalEntryId ?? null,
      p_source_doc_type: parsed.data.sourceDocType ?? null,
      p_source_doc_id: parsed.data.sourceDocId ?? null,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function acceptReconciliationMatchAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      acceptReconciliationMatchSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("accept_reconciliation_match", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_match_id: parsed.data.matchId,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function rejectReconciliationMatchAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      rejectReconciliationMatchSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("reject_reconciliation_match", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_match_id: parsed.data.matchId,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function completeReconciliationSessionAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      completeReconciliationSessionSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("complete_reconciliation_session", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_statement_id: parsed.data.statementId,
    });

    revalidateReconciliationPaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
