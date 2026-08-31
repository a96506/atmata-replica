import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolveAppOrigin } from "@/lib/app-url";
import { getEmailTemplateCopy } from "@/lib/email/templates";
import { createInsForgeAdminClient } from "@/lib/insforge/server";
import type { JobRow } from "@/lib/jobs/types";
import type {
  EmailEvent,
  EmailSendInput,
  EmailSendResult,
  FunctionLocale,
} from "@/types/functions";

type AdminClient = ReturnType<typeof createInsForgeAdminClient>;
// User SSR client shares the same database/emails surface.
type JobsClient = AdminClient;

export type EmailJobPayload = EmailSendInput & {
  companyId: string;
  actorUserId: string;
};

export type RunEmailSendContext = {
  companyId: string;
  companyName: string;
  actorUserId: string;
  roles: string[];
  isPlatformAdmin?: boolean;
  /**
   * `rpc` — claim_email_delivery / complete_email_delivery (needs auth.uid()).
   * `admin` — direct email_log writes scoped by companyId (worker path).
   */
  claimMode: "rpc" | "admin";
};

export class EmailSendError extends Error {
  constructor(
    readonly code:
      | "VALIDATION"
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "EMAIL_DELIVERY_FAILED",
    readonly retryable = false,
  ) {
    super(code);
    this.name = "EmailSendError";
  }
}

const EVENTS = new Set<EmailEvent>([
  "quote_sent",
  "rfq_invitation",
  "approval_requested",
  "approval_rejected",
  "user_invitation",
]);

const REQUIRED_ROLES: Record<EmailEvent, string[]> = {
  quote_sent: ["sales_rep", "admin"],
  rfq_invitation: ["buyer", "admin"],
  approval_requested: ["admin", "approver"],
  approval_rejected: ["admin", "approver"],
  user_invitation: ["admin"],
};

type ResolvedDelivery = {
  recipient: string;
  reference: string;
  docType: string;
  docId: string;
  invitationLink?: string;
  idempotencySuffix?: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function appOrigin(): string {
  return resolveAppOrigin() ?? "";
}

export function parseEmailSendInput(value: unknown): EmailSendInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.event !== "string" ||
    !EVENTS.has(body.event as EmailEvent) ||
    (body.locale !== "en" && body.locale !== "ar") ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.trim().length < 1 ||
    body.idempotencyKey.length > 240
  ) {
    return null;
  }
  const input = {
    event: body.event as EmailEvent,
    locale: body.locale as FunctionLocale,
    idempotencyKey: body.idempotencyKey,
    docId: typeof body.docId === "string" ? body.docId : undefined,
    approvalRequestId:
      typeof body.approvalRequestId === "string"
        ? body.approvalRequestId
        : undefined,
    invitationId:
      typeof body.invitationId === "string" ? body.invitationId : undefined,
    invitationToken:
      typeof body.invitationToken === "string" &&
      body.invitationToken.length >= 32
        ? body.invitationToken
        : undefined,
  } satisfies EmailSendInput;
  const reference =
    input.event === "user_invitation"
      ? input.invitationId
      : input.event.startsWith("approval_")
        ? input.approvalRequestId
        : input.docId;
  return typeof reference === "string" && reference.length <= 160 ? input : null;
}

function render(
  event: EmailEvent,
  locale: FunctionLocale,
  company: string,
  reference: string,
  invitationLink?: string,
) {
  const copy = getEmailTemplateCopy(event, locale);
  const vars = { company, reference };
  const subject = fill(copy.subject, vars);
  const heading = fill(copy.heading, vars);
  const body = fill(copy.body, vars);
  const ar = locale === "ar";
  const actionHtml = invitationLink
    ? `<p><a href="${escapeHtml(invitationLink)}">${escapeHtml(copy.action)}</a></p><p dir="ltr">${escapeHtml(invitationLink)}</p>`
    : "";
  return {
    subject,
    html: `<!doctype html><html dir="${ar ? "rtl" : "ltr"}" lang="${locale}"><body style="font-family:Arial,sans-serif;color:#111"><main style="max-width:600px;margin:auto;padding:24px"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p>${actionHtml}</main></body></html>`,
  };
}

async function assertCompanyScope(
  client: JobsClient,
  companyId: string,
  table: string,
  id: string,
  idColumn = "id",
): Promise<boolean> {
  const { data } = await client.database
    .from(table)
    .select("id")
    .eq(idColumn, id)
    .eq("company_id", companyId)
    .maybeSingle();
  return Boolean(data);
}

async function resolveDeliveries(
  client: JobsClient,
  input: EmailSendInput,
  companyId: string,
  companyName: string,
  claimMode: "rpc" | "admin",
): Promise<ResolvedDelivery[] | null> {
  if (input.event === "user_invitation") {
    const { data } = await client.database
      .from("invitations")
      .select("id, email, status, company_id")
      .eq("id", input.invitationId!)
      .eq("status", "pending")
      .maybeSingle();
    if (!data || String(data.company_id) !== companyId) return null;

    let rawToken = input.invitationToken;
    if (!rawToken) {
      if (claimMode === "rpc") {
        const { data: rotated, error } = await client.database.rpc(
          "rotate_invitation_token",
          { p_invitation_id: String(data.id) },
        );
        if (error || typeof rotated !== "string" || rotated.length < 32) {
          return null;
        }
        rawToken = rotated;
      } else {
        rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const { error } = await client.database
          .from("invitations")
          .update({ token_hash: tokenHash })
          .eq("id", data.id)
          .eq("company_id", companyId)
          .eq("status", "pending");
        if (error) return null;
      }
    }

    const origin = appOrigin();
    const invitationLink = origin
      ? `${origin}/${input.locale}/invitation?token=${encodeURIComponent(rawToken)}`
      : `/invitation?token=${encodeURIComponent(rawToken)}`;
    return [
      {
        recipient: String(data.email),
        reference: companyName,
        docType: "invitation",
        docId: String(data.id),
        invitationLink,
      },
    ];
  }

  if (input.event.startsWith("approval_")) {
    const { data: approval } = await client.database
      .from("approval_requests")
      .select("id, doc_type, doc_id, requested_by, company_id")
      .eq("id", input.approvalRequestId!)
      .maybeSingle();
    if (!approval || String(approval.company_id) !== companyId) return null;
    let recipientId = String(approval.requested_by);
    if (input.event === "approval_requested") {
      const { data: members } = await client.database
        .from("company_members")
        .select("user_id, roles")
        .eq("company_id", companyId)
        .eq("active", true)
        .limit(100);
      const approver = (members ?? []).find(
        (member: { roles?: string[] }) =>
          (member.roles ?? []).some(
            (role) => role === "approver" || role === "admin",
          ),
      );
      if (approver) recipientId = String(approver.user_id);
    }
    const { data: profile } = await client.database
      .from("user_profiles")
      .select("email")
      .eq("id", recipientId)
      .maybeSingle();
    if (!profile?.email) return null;
    return [
      {
        recipient: String(profile.email),
        reference: `${approval.doc_type} ${approval.doc_id}`,
        docType: String(approval.doc_type),
        docId: String(approval.doc_id),
      },
    ];
  }

  if (input.event === "quote_sent") {
    const { data: quote } = await client.database
      .from("quotes")
      .select("id, number, customer_id, company_id")
      .eq("id", input.docId!)
      .maybeSingle();
    if (!quote || String(quote.company_id) !== companyId) return null;
    const { data: customer } = await client.database
      .from("customers")
      .select("email, company_id")
      .eq("id", quote.customer_id)
      .maybeSingle();
    if (
      !customer?.email ||
      String(customer.company_id) !== companyId
    ) {
      return null;
    }
    return [
      {
        recipient: String(customer.email),
        reference: String(quote.number ?? quote.id),
        docType: "quote",
        docId: String(quote.id),
      },
    ];
  }

  if (input.event === "rfq_invitation") {
    const { data: rfq } = await client.database
      .from("rfqs")
      .select("id, number, company_id")
      .eq("id", input.docId!)
      .maybeSingle();
    if (!rfq || String(rfq.company_id) !== companyId) return null;
    const { data: invited } = await client.database
      .from("rfq_invited_suppliers")
      .select("supplier_id")
      .eq("rfq_id", rfq.id);
    const supplierIds = [
      ...new Set(
        (invited ?? []).map((row: { supplier_id: string }) =>
          String(row.supplier_id),
        ),
      ),
    ];
    if (supplierIds.length === 0) return null;
    const { data: suppliers } = await client.database
      .from("suppliers")
      .select("id, email, company_id")
      .eq("company_id", companyId)
      .in("id", supplierIds);
    const deliveries = (suppliers ?? [])
      .filter(
        (supplier: { email?: string }) =>
          typeof supplier.email === "string" && supplier.email.includes("@"),
      )
      .map((supplier: { id: string; email: string }) => ({
        recipient: String(supplier.email),
        reference: String(rfq.number ?? rfq.id),
        docType: "rfq",
        docId: String(rfq.id),
        idempotencySuffix: String(supplier.id),
      }));
    return deliveries.length ? deliveries : null;
  }

  return null;
}

type ClaimResult = {
  claimed: boolean;
  leaseToken?: string;
  delivery: { id: string; status: string };
};

async function claimViaRpc(
  client: JobsClient,
  args: {
    idempotencyKey: string;
    kind: EmailEvent;
    recipient: string;
    subject: string;
    locale: FunctionLocale;
    docType: string;
    docId: string;
  },
): Promise<ClaimResult> {
  const { data, error } = await client.database.rpc("claim_email_delivery", {
    p_idempotency_key: args.idempotencyKey,
    p_kind: args.kind,
    p_recipient: args.recipient,
    p_subject: args.subject,
    p_locale: args.locale,
    p_doc_type: args.docType,
    p_doc_id: args.docId,
    p_lease_seconds: 300,
  });
  if (error || !data) throw new EmailSendError("CONFLICT", true);
  return data as ClaimResult;
}

async function claimViaAdmin(
  client: JobsClient,
  args: {
    companyId: string;
    actorUserId: string;
    idempotencyKey: string;
    kind: EmailEvent;
    recipient: string;
    subject: string;
    locale: FunctionLocale;
    docType: string;
    docId: string;
  },
): Promise<ClaimResult> {
  await client.database.from("email_log").insert([
    {
      company_id: args.companyId,
      kind: args.kind,
      recipient: args.recipient.trim(),
      subject: args.subject.trim(),
      locale: args.locale,
      doc_type: args.docType,
      doc_id: args.docId,
      idempotency_key: args.idempotencyKey.trim(),
      requested_by: args.actorUserId,
      status: "queued",
    },
  ]);

  const { data: existing, error } = await client.database
    .from("email_log")
    .select("id, status, kind, recipient, subject, locale, doc_type, doc_id")
    .eq("company_id", args.companyId)
    .eq("idempotency_key", args.idempotencyKey.trim())
    .maybeSingle();
  if (error || !existing) throw new EmailSendError("CONFLICT", true);

  const row = existing as {
    id: string;
    status: string;
    kind: string;
    recipient: string;
    subject: string;
    locale: string;
    doc_type: string;
    doc_id: string;
    lease_expires_at?: string | null;
  };

  if (
    row.kind !== args.kind ||
    row.recipient !== args.recipient.trim() ||
    row.subject !== args.subject.trim() ||
    row.locale !== args.locale ||
    row.doc_type !== args.docType ||
    row.doc_id !== args.docId
  ) {
    throw new EmailSendError("CONFLICT");
  }

  if (row.status === "sent" || row.status === "skipped") {
    return {
      claimed: false,
      delivery: { id: row.id, status: row.status },
    };
  }

  const canClaim =
    row.status === "queued" ||
    row.status === "failed" ||
    row.status === "sending";
  if (!canClaim) throw new EmailSendError("CONFLICT", true);

  const leaseToken = randomUUID();
  const leaseHash = createHash("sha256").update(leaseToken).digest("hex");
  const leaseExpires = new Date(Date.now() + 300_000).toISOString();
  const { data: updated, error: updateError } = await client.database
    .from("email_log")
    .update({
      status: "sending",
      last_error_code: null,
      lease_token_hash: leaseHash,
      lease_expires_at: leaseExpires,
    })
    .eq("id", row.id)
    .eq("company_id", args.companyId)
    .select("id, status")
    .maybeSingle();
  if (updateError || !updated) throw new EmailSendError("CONFLICT", true);
  // attempt_count increment is best-effort (RPC does it atomically).
  return {
    claimed: true,
    leaseToken,
    delivery: { id: String(updated.id), status: String(updated.status) },
  };
}

async function completeViaRpc(
  client: JobsClient,
  args: {
    deliveryId: string;
    leaseToken?: string;
    status: "sent" | "failed" | "skipped";
    providerReference?: string | null;
    errorCode?: string | null;
  },
) {
  await client.database.rpc("complete_email_delivery", {
    p_delivery_id: args.deliveryId,
    p_lease_token: args.leaseToken,
    p_status: args.status,
    p_provider_reference: args.providerReference ?? null,
    p_error_code: args.errorCode ?? null,
  });
}

async function completeViaAdmin(
  client: JobsClient,
  args: {
    companyId: string;
    deliveryId: string;
    status: "sent" | "failed" | "skipped";
    providerReference?: string | null;
    errorCode?: string | null;
  },
) {
  const patch: Record<string, unknown> = {
    status: args.status,
    lease_token_hash: null,
    lease_expires_at: null,
    last_error_code: args.status === "failed" ? args.errorCode ?? "FAILED" : null,
    provider_reference: args.providerReference ?? null,
  };
  if (args.status === "sent") {
    patch.sent_at = new Date().toISOString();
  }
  await client.database
    .from("email_log")
    .update(patch)
    .eq("id", args.deliveryId)
    .eq("company_id", args.companyId);
}

/**
 * Shared email-send runner (edge function port).
 * Action path: user client + claimMode `rpc`.
 * Worker path: admin client + claimMode `admin` + company scope checks.
 */
export async function runEmailSend(
  client: JobsClient,
  input: EmailSendInput,
  ctx: RunEmailSendContext,
): Promise<EmailSendResult> {
  const startedAt = Date.now();
  if (!EVENTS.has(input.event)) throw new EmailSendError("VALIDATION");

  if (
    !(
      ctx.isPlatformAdmin &&
      input.event === "user_invitation" &&
      input.invitationToken
    ) &&
    !ctx.roles.some((role) => REQUIRED_ROLES[input.event].includes(role))
  ) {
    throw new EmailSendError("FORBIDDEN");
  }

  // Platform-admin invitation: token is caller-supplied; still scope company.
  if (
    input.event === "user_invitation" &&
    ctx.isPlatformAdmin &&
    input.invitationToken
  ) {
    const ok = await assertCompanyScope(
      client,
      ctx.companyId,
      "invitations",
      input.invitationId!,
    );
    if (!ok) throw new EmailSendError("NOT_FOUND");
  }

  const deliveries = await resolveDeliveries(
    client,
    input,
    ctx.companyId,
    ctx.companyName,
    ctx.claimMode,
  );
  if (!deliveries) throw new EmailSendError("NOT_FOUND");

  let lastResult: EmailSendResult | null = null;
  for (const resolved of deliveries) {
    const rendered = render(
      input.event,
      input.locale,
      ctx.companyName,
      resolved.reference,
      resolved.invitationLink,
    );
    const idempotencyKey = resolved.idempotencySuffix
      ? `${input.idempotencyKey.trim()}:${resolved.idempotencySuffix}`.slice(
          0,
          240,
        )
      : input.idempotencyKey.trim();

    const claim =
      ctx.claimMode === "rpc"
        ? await claimViaRpc(client, {
            idempotencyKey,
            kind: input.event,
            recipient: resolved.recipient,
            subject: rendered.subject,
            locale: input.locale,
            docType: resolved.docType,
            docId: resolved.docId,
          })
        : await claimViaAdmin(client, {
            companyId: ctx.companyId,
            actorUserId: ctx.actorUserId,
            idempotencyKey,
            kind: input.event,
            recipient: resolved.recipient,
            subject: rendered.subject,
            locale: input.locale,
            docType: resolved.docType,
            docId: resolved.docId,
          });

    if (!claim.claimed) {
      if (
        claim.delivery.status === "sent" ||
        claim.delivery.status === "skipped"
      ) {
        lastResult = {
          deliveryId: claim.delivery.id,
          status: claim.delivery.status as "sent" | "skipped",
          duplicate: true,
          invitationLink: resolved.invitationLink,
        };
        continue;
      }
      throw new EmailSendError("CONFLICT", true);
    }

    try {
      const { data: sent, error: sendError } = await client.emails.send({
        to: resolved.recipient,
        subject: rendered.subject,
        html: rendered.html,
        from: ctx.companyName.slice(0, 80),
      });
      if (sendError) throw sendError;
      const skipped = Boolean(
        (sent as { skipped?: unknown[] } | null)?.skipped?.length,
      );
      if (ctx.claimMode === "rpc") {
        await completeViaRpc(client, {
          deliveryId: claim.delivery.id,
          leaseToken: claim.leaseToken,
          status: skipped ? "skipped" : "sent",
          providerReference: skipped
            ? null
            : String((sent as { id?: string } | null)?.id ?? "").slice(0, 160) ||
              null,
        });
      } else {
        await completeViaAdmin(client, {
          companyId: ctx.companyId,
          deliveryId: claim.delivery.id,
          status: skipped ? "skipped" : "sent",
          providerReference: skipped
            ? null
            : String((sent as { id?: string } | null)?.id ?? "").slice(0, 160) ||
              null,
        });
      }
      lastResult = {
        deliveryId: claim.delivery.id,
        status: skipped ? "skipped" : "sent",
        duplicate: false,
        invitationLink: resolved.invitationLink,
      };
    } catch {
      if (ctx.claimMode === "rpc") {
        await completeViaRpc(client, {
          deliveryId: claim.delivery.id,
          leaseToken: claim.leaseToken,
          status: "failed",
          errorCode: "PROVIDER_FAILED",
        });
      } else {
        await completeViaAdmin(client, {
          companyId: ctx.companyId,
          deliveryId: claim.delivery.id,
          status: "failed",
          errorCode: "PROVIDER_FAILED",
        });
      }
      throw new EmailSendError("EMAIL_DELIVERY_FAILED", true);
    }
  }

  if (!lastResult) throw new EmailSendError("NOT_FOUND");

  console.info({
    function: "email-handler",
    operation: input.event,
    companyId: ctx.companyId,
    userId: ctx.actorUserId,
    documentId: deliveries[0]?.docId,
    durationMs: Date.now() - startedAt,
    resultCode: lastResult.status === "skipped" ? "SKIPPED" : "OK",
  });

  return lastResult;
}

function parseJobPayload(raw: Record<string, unknown>): EmailJobPayload {
  const input = parseEmailSendInput(raw);
  const companyId =
    typeof raw.companyId === "string" ? raw.companyId.trim() : "";
  const actorUserId =
    typeof raw.actorUserId === "string" ? raw.actorUserId.trim() : "";
  if (!input || !companyId || !actorUserId) {
    throw new Error("email: invalid payload");
  }
  return { ...input, companyId, actorUserId };
}

/** Worker registry entry for job type `email`. */
export async function handleEmailJob(job: JobRow): Promise<void> {
  const payload = parseJobPayload(
    (job.payload ?? {}) as Record<string, unknown>,
  );
  if (payload.companyId !== job.company_id) {
    throw new Error("email: company_id mismatch");
  }
  const admin = createInsForgeAdminClient();
  const { data: company } = await admin.database
    .from("companies")
    .select("id, name")
    .eq("id", payload.companyId)
    .maybeSingle();
  if (!company) throw new Error("email: company not found");

  const { data: member } = await admin.database
    .from("company_members")
    .select("roles")
    .eq("company_id", payload.companyId)
    .eq("user_id", payload.actorUserId)
    .eq("active", true)
    .maybeSingle();

  // Platform provision path: invitation with token and no company membership.
  const isPlatformAdmin =
    payload.event === "user_invitation" &&
    Boolean(payload.invitationToken) &&
    !member;

  await runEmailSend(admin, payload, {
    companyId: payload.companyId,
    companyName: String(company.name),
    actorUserId: payload.actorUserId,
    roles: (member?.roles as string[] | undefined) ?? ["admin"],
    isPlatformAdmin,
    claimMode: "admin",
  });
}
