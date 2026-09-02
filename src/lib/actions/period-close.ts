"use server";

import { revalidatePath } from "next/cache";

import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import {
  closeFiscalYearSchema,
  completePeriodCloseTaskSchema,
  markInboxNotificationReadSchema,
  rescanPeriodCloseSchema,
  setFiscalPeriodStatusSchema,
  startPeriodCloseSchema,
} from "@/lib/actions/validation/period-close";
import { callWriteRpcJson } from "@/lib/actions/write-rpc";

function revalidatePeriodClosePaths(locale: "en" | "ar") {
  revalidatePath(`/${locale}/accounting/close`);
  revalidatePath(`/accounting/close`);
  revalidatePath(`/${locale}/settings/fiscal-calendar`);
  revalidatePath(`/settings/fiscal-calendar`);
  revalidatePath(`/${locale}/inbox`);
  revalidatePath(`/inbox`);
}

export async function startPeriodCloseAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      startPeriodCloseSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    // The real period close is the fiscal-calendar state transition
    // (open → soft_closed) — the same RPC `set_fiscal_period_status` the
    // Fiscal calendar grid uses. "Run close" must actually close the
    // period, not just toast success.
    // Distinct idempotency keys: same client key must not collide across RPCs.
    const key = parsed.data.idempotencyKey;
    await callWriteRpcJson("set_fiscal_period_status", {
      p_idempotency_key: `${key}:fiscal`,
      p_fiscal_period_id: parsed.data.fiscalPeriodId,
      p_status: "soft_closed",
    });

    // Then create / refresh the close run + checklist tasks.
    const data = await callWriteRpcJson("start_period_close", {
      p_idempotency_key: `${key}:start`,
      p_fiscal_period_id: parsed.data.fiscalPeriodId,
    });

    revalidatePeriodClosePaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function rescanPeriodCloseAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      rescanPeriodCloseSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("rescan_period_close", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_fiscal_period_id: parsed.data.fiscalPeriodId,
    });

    revalidatePeriodClosePaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function completePeriodCloseTaskAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      completePeriodCloseTaskSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("complete_period_close_task", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_task_id: parsed.data.taskId,
      p_status: parsed.data.status,
    });

    revalidatePeriodClosePaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function setFiscalPeriodStatusAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      setFiscalPeriodStatusSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("set_fiscal_period_status", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_fiscal_period_id: parsed.data.fiscalPeriodId,
      p_status: parsed.data.status,
    });

    revalidatePeriodClosePaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function closeFiscalYearAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      closeFiscalYearSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const data = await callWriteRpcJson("close_fiscal_year", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_year: parsed.data.year,
    });

    revalidatePeriodClosePaths(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

/**
 * Synthesized inbox rows use ids `pending:{docType}:{docId}` (see inbox.ts).
 * Persist mark-read by upserting a real notifications row with that id and
 * read_at set; the feed then prefers the DB row and skips re-synthesis.
 */
function parsePendingInboxId(
  notificationId: string,
): { docType: string; docId: string } | null {
  if (!notificationId.startsWith("pending:")) return null;
  const rest = notificationId.slice("pending:".length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return null;
  const docType = rest.slice(0, colon).trim();
  const docId = rest.slice(colon + 1).trim();
  if (!docType || !docId) return null;
  return { docType, docId };
}

export async function markInboxNotificationReadAction(
  input: unknown,
): Promise<ActionResult<unknown>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      markInboxNotificationReadSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;

    const notificationId = parsed.data.notificationId;
    const pending = parsePendingInboxId(notificationId);

    if (pending) {
      const { getAppSession } = await import("@/lib/insforge/session");
      const { createInsForgeServerClient } = await import(
        "@/lib/insforge/server"
      );
      const { session } = await getAppSession();
      if (!session) {
        return {
          ok: false,
          error: {
            code: "UNAUTHENTICATED",
            messageKey: "errors.unauthenticated",
            retryable: false,
            requestId,
          },
        };
      }

      const client = await createInsForgeServerClient();
      const now = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const insertResult: any = await client.database
        .from("notifications")
        .insert([
          {
            id: notificationId,
            recipient_user_id: session.user.id,
            kind: "approval_requested",
            title: "Document awaiting approval",
            body: "Marked read from inbox.",
            doc_type: pending.docType,
            doc_id: pending.docId,
            read_at: now,
          },
        ]);

      if (insertResult.error) {
        const msg = String(insertResult.error.message ?? "");
        // Already persisted (re-mark or race) — fall through to the read RPC.
        if (!/duplicate|unique|already exists/i.test(msg)) {
          throw new Error(msg || "notifications insert failed");
        }
        await callWriteRpcJson("mark_inbox_notification_read", {
          p_idempotency_key: parsed.data.idempotencyKey,
          p_notification_id: notificationId,
        });
      }

      revalidatePath(`/${parsed.data.locale}/inbox`);
      revalidatePath(`/inbox`);
      return {
        ok: true,
        data: { notificationId, read: true, synthesized: true },
      };
    }

    const data = await callWriteRpcJson("mark_inbox_notification_read", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_notification_id: notificationId,
    });

    revalidatePath(`/${parsed.data.locale}/inbox`);
    revalidatePath(`/inbox`);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
