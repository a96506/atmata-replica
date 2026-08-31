"use server";

import { z } from "zod";
import { enqueueJob } from "@/lib/jobs";
import {
  EmailSendError,
  runEmailSend,
} from "@/lib/jobs/handlers/email";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getAppSession, getPlatformAdminGate } from "@/lib/insforge/session";
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

export type QueuedEmailResult = {
  jobId: string;
  status: "queued";
};

function mapEmailError(
  error: unknown,
  requestId: string,
): ActionResult<never> {
  if (error instanceof EmailSendError) {
    return actionFailure(error.code, {
      messageKey:
        error.code === "EMAIL_DELIVERY_FAILED"
          ? "email.errors.deliveryFailed"
          : error.code === "VALIDATION"
            ? "email.errors.invalidRequest"
            : undefined,
      retryable: error.retryable,
      requestId,
    });
  }
  return actionFailure("INTERNAL", { requestId });
}

/**
 * Send a transactional email.
 *
 * Invitations stay sync (hybrid A) so callers receive `invitationLink`.
 * Other events enqueue a worker job and return `{ jobId, status: 'queued' }`.
 */
export async function sendTransactionalEmail(
  input: EmailSendInput,
): Promise<ActionResult<EmailSendResult | QueuedEmailResult>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return actionFailure("VALIDATION", {
      messageKey: "email.errors.invalidRequest",
    });
  }
  const requestId = createRequestId();
  const data = parsed.data;

  try {
    if (data.event === "user_invitation") {
      const client = await createInsForgeServerClient();
      const platform = await getPlatformAdminGate();
      const { session } = await getAppSession();

      let companyId: string;
      let companyName: string;
      let actorUserId: string;
      let roles: string[];
      let isPlatformAdmin = false;

      if (platform.reason === null && data.invitationToken) {
        isPlatformAdmin = true;
        actorUserId = platform.user.id;
        const { data: invitation } = await client.database
          .from("invitations")
          .select("company_id")
          .eq("id", data.invitationId!)
          .eq("status", "pending")
          .maybeSingle();
        if (!invitation) {
          return actionFailure("NOT_FOUND", { requestId });
        }
        companyId = String(invitation.company_id);
        const { data: company } = await client.database
          .from("companies")
          .select("id, name")
          .eq("id", companyId)
          .maybeSingle();
        if (!company) return actionFailure("NOT_FOUND", { requestId });
        companyName = String(company.name);
        roles = ["admin"];
      } else if (session) {
        companyId = session.companyId;
        companyName = session.company.name;
        actorUserId = session.user.id;
        roles = session.roles;
      } else {
        return actionFailure("UNAUTHENTICATED", { requestId });
      }

      const result = await runEmailSend(client, data, {
        companyId,
        companyName,
        actorUserId,
        roles,
        isPlatformAdmin,
        claimMode: "rpc",
      });
      return { ok: true, data: result };
    }

    const { session } = await getAppSession();
    if (!session) return actionFailure("UNAUTHENTICATED", { requestId });

    const { id: jobId } = await enqueueJob(
      "email",
      {
        ...data,
        companyId: session.companyId,
        actorUserId: session.user.id,
      },
      { companyId: session.companyId },
    );
    return { ok: true, data: { jobId, status: "queued" } };
  } catch (error) {
    return mapEmailError(error, requestId);
  }
}
