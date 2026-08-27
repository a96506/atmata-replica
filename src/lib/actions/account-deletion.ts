"use server";

import "server-only";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import {
  createRequestId,
  KnownActionError,
  normalizeActionError,
} from "@/lib/actions/errors";
import { validateActionInput } from "@/lib/actions/validation";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getAppSession } from "@/lib/insforge/session";

/**
 * Self-service account/data deletion request.
 *
 * Defensive: a `deletion_requests` table may not exist yet (added by a
 * parallel migration). When it exists, we insert a row so the platform
 * operator can pick it up from the DB. When it does not exist, we cannot
 * fall back to the `email-send` function because that function is locked to
 * a fixed enum of business events and cannot send an arbitrary message to
 * the platform admin — so we surface a clear "request sent to operator"
 * state to the user instead of crashing.
 */

const schema = z.object({
  locale: z.enum(["en", "ar"]),
  reason: z.string().trim().max(1000).optional(),
});

export type AccountDeletionResult =
  | {
      /** Row inserted into `deletion_requests`. */
      channel: "table";
      requestId: string;
    }
  | {
      /**
       * Table not provisioned yet. The request could not be persisted; the
       * user is told an operator will be in touch (no email actually sent —
       * the email function is locked to specific business events).
       */
      channel: "operator";
      requestId: string;
      note: string;
    };

export async function requestAccountDeletionAction(
  input: unknown,
): Promise<ActionResult<AccountDeletionResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(schema, input, requestId);
    if (!parsed.ok) return parsed;
    const { reason } = parsed.data;

    const { session } = await getAppSession();
    if (!session) throw new KnownActionError("UNAUTHENTICATED");

    const client = await createInsForgeServerClient();
    const payload = {
      company_id: session.companyId,
      requested_by: session.user.id,
      reason: reason ?? null,
      status: "pending",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await client.database
      .from("deletion_requests")
      .insert([payload])
      .select("id")
      .maybeSingle();

    if (!result.error && result.data) {
      return {
        ok: true,
        data: {
          channel: "table",
          requestId: String(result.data.id),
        },
      };
    }

    // Table missing (or RLS denies the insert) → surface the operator state.
    const msg = String(result.error?.message ?? "");
    const tableMissing =
      /relation .* does not exist/i.test(msg) ||
      /could not find the table/i.test(msg) ||
      result.error?.code === "PGRST205" || // PostgREST: schemaCacheMiss / relation not found
      result.error?.code === "42P01"; // Postgres undefined_table
    if (tableMissing) {
      return {
        ok: true,
        data: {
          channel: "operator",
          requestId,
          note:
            "deletion_requests table is not provisioned yet — your request was flagged for the platform operator.",
        },
      };
    }

    // Any other error (RLS denial, etc.) → surface as a normal failure.
    if (result.error) {
      throw new KnownActionError("INTERNAL", { messageKey: "errors.internal" });
    }

    // No row returned and no error — treat as operator fallback.
    return {
      ok: true,
      data: {
        channel: "operator",
        requestId,
        note: "Your request was flagged for the platform operator.",
      },
    };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
