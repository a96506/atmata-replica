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

    const data = await callWriteRpcJson("start_period_close", {
      p_idempotency_key: parsed.data.idempotencyKey,
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

    const data = await callWriteRpcJson("mark_inbox_notification_read", {
      p_idempotency_key: parsed.data.idempotencyKey,
      p_notification_id: parsed.data.notificationId,
    });

    revalidatePath(`/${parsed.data.locale}/inbox`);
    revalidatePath(`/inbox`);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
