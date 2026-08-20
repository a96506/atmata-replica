"use server";

import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import { createJournalEntrySchema } from "@/lib/actions/validation/gl";
import {
  callWriteRpc,
  revalidateDocumentPaths,
  type DocumentWriteResult,
} from "@/lib/actions/write-rpc";

export async function createJournalEntryAction(
  input: unknown,
): Promise<ActionResult<DocumentWriteResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      createJournalEntrySchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpc("create_journal_entry", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_intent: parsed.data.intent,
      p_header: parsed.data.header,
      p_lines: parsed.data.lines,
      p_source: parsed.data.source ?? null,
    });

    revalidateDocumentPaths(parsed.data.locale, "journal_entry", data.id);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
