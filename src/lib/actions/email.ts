"use server";

import { z } from "zod";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { actionFailure, createRequestId } from "./errors";
import type { ActionResult } from "./result";
import type { EmailSendInput, EmailSendResult } from "@/types/functions";

const schema = z
  .object({
    event: z.enum([
      "quote_sent",
      "rfq_invitation",
      "approval_requested",
      "approval_rejected",
      "user_invitation",
    ]),
    docId: z.string().trim().min(1).max(160).optional(),
    approvalRequestId: z.string().trim().min(1).max(160).optional(),
    invitationId: z.string().trim().min(1).max(160).optional(),
    invitationToken: z.string().trim().min(32).max(128).optional(),
    locale: z.enum(["en", "ar"]),
    idempotencyKey: z.string().trim().min(1).max(240),
  })
  .superRefine((value, ctx) => {
    const required =
      value.event === "user_invitation"
        ? value.invitationId
        : value.event.startsWith("approval_")
          ? value.approvalRequestId
          : value.docId;
    if (!required) {
      ctx.addIssue({ code: "custom", path: ["event"], message: "missing reference" });
    }
  });

function isEmailResult(value: unknown): value is EmailSendResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.deliveryId === "string" &&
    (result.status === "sent" || result.status === "skipped") &&
    typeof result.duplicate === "boolean" &&
    (result.invitationLink === undefined || typeof result.invitationLink === "string")
  );
}

export async function sendTransactionalEmail(
  input: EmailSendInput,
): Promise<ActionResult<EmailSendResult>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return actionFailure("VALIDATION", {
      messageKey: "email.errors.invalidRequest",
    });
  }
  const requestId = createRequestId();
  try {
    const client = await createInsForgeServerClient();
    const { data, error } = await client.functions.invoke("email-send", {
      body: parsed.data,
    });
    if (error) {
      return actionFailure("EMAIL_DELIVERY_FAILED", {
        messageKey: "email.errors.deliveryFailed",
        retryable: true,
        requestId,
      });
    }
    if (!isEmailResult(data)) {
      return actionFailure("INTERNAL", { requestId });
    }
    return { ok: true, data };
  } catch {
    return actionFailure("INTERNAL", { requestId });
  }
}
