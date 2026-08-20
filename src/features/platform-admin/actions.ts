"use server";

import { revalidatePath } from "next/cache";
import { KnownActionError, actionFailure, createRequestId, normalizeActionError } from "@/lib/actions/errors";
import { validateActionInput } from "@/lib/actions/validation";
import type { ActionResult } from "@/lib/actions/result";
import { sendTransactionalEmail } from "@/lib/actions/email";
import {
  companyIdSchema,
  listCompaniesSchema,
  provisionCompanySchema,
  resendOwnerInvitationSchema,
  setCompanyStatusSchema,
} from "./schemas";
import * as commands from "./application/commands";
import * as queries from "./application/queries";
import { isPlatformAdmin } from "./infrastructure/insforge-repository";
import type {
  PlatformCompanyDetail,
  PlatformCompanyList,
  PlatformRowCounts,
  ProvisioningResult,
} from "./domain/company";
import { resolveAppOrigin } from "@/lib/app-url";

function invitationLink(token: string, locale: "en" | "ar"): string {
  const origin = resolveAppOrigin() ?? "";
  const path = `/${locale}/invitation?token=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

async function requirePlatformAdmin(requestId: string) {
  const allowed = await isPlatformAdmin();
  if (!allowed) {
    throw new KnownActionError("FORBIDDEN");
  }
  return requestId;
}

export type ProvisionActionData = ProvisioningResult & {
  invitationLink?: string;
  emailDelivered: boolean;
};

export async function listCompaniesAction(
  input: unknown,
): Promise<ActionResult<PlatformCompanyList>> {
  const requestId = createRequestId();
  try {
    await requirePlatformAdmin(requestId);
    const parsed = validateActionInput(listCompaniesSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const data = await queries.listCompanies(parsed.data);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function getCompanyAction(
  input: unknown,
): Promise<ActionResult<PlatformCompanyDetail>> {
  const requestId = createRequestId();
  try {
    await requirePlatformAdmin(requestId);
    const parsed = validateActionInput(companyIdSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const data = await queries.getCompany(parsed.data.companyId);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function getCompanyRowCountsAction(
  input: unknown,
): Promise<ActionResult<PlatformRowCounts>> {
  const requestId = createRequestId();
  try {
    await requirePlatformAdmin(requestId);
    const parsed = validateActionInput(companyIdSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const data = await queries.getCompanyRowCounts(parsed.data.companyId);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

async function deliverOwnerInvitation(input: {
  invitationId: string;
  invitationToken: string;
  locale: "en" | "ar";
  requestId: string;
}): Promise<{ emailDelivered: boolean; invitationLink: string }> {
  const link = invitationLink(input.invitationToken, input.locale);
  const sent = await sendTransactionalEmail({
    event: "user_invitation",
    invitationId: input.invitationId,
    invitationToken: input.invitationToken,
    locale: input.locale,
    idempotencyKey: `platform-owner:${input.invitationId}:${input.requestId}`,
  });
  return { emailDelivered: sent.ok, invitationLink: sent.ok && sent.data.invitationLink ? sent.data.invitationLink : link };
}

export async function provisionCompanyAction(
  input: unknown,
): Promise<ActionResult<ProvisionActionData>> {
  const requestId = createRequestId();
  try {
    await requirePlatformAdmin(requestId);
    const parsed = validateActionInput(provisionCompanySchema, input, requestId);
    if (!parsed.ok) return parsed;
    const provisioned = await commands.provisionCompany({
      operationId: requestId,
      name: parsed.data.name,
      ownerEmail: parsed.data.ownerEmail,
      ownerName: parsed.data.ownerName,
    });
    revalidatePath("/platform-admin");
    if (!provisioned.invitationToken) {
      return {
        ok: true,
        data: { ...provisioned, emailDelivered: false },
        messageKey: "platformAdmin.provision.complete",
      };
    }
    const delivery = await deliverOwnerInvitation({
      invitationId: provisioned.invitationId,
      invitationToken: provisioned.invitationToken,
      locale: parsed.data.locale,
      requestId,
    });
    return {
      ok: true,
      data: {
        ...provisioned,
        invitationLink: delivery.invitationLink,
        emailDelivered: delivery.emailDelivered,
      },
      messageKey: delivery.emailDelivered
        ? "platformAdmin.provision.complete"
        : "platformAdmin.provision.emailFailed",
    };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function resendOwnerInvitationAction(
  input: unknown,
): Promise<ActionResult<ProvisionActionData>> {
  const requestId = createRequestId();
  try {
    await requirePlatformAdmin(requestId);
    const parsed = validateActionInput(resendOwnerInvitationSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const resent = await commands.resendOwnerInvitation(parsed.data.companyId);
    if (!resent.invitationToken) {
      return actionFailure("NOT_FOUND", { requestId });
    }
    const delivery = await deliverOwnerInvitation({
      invitationId: resent.invitationId,
      invitationToken: resent.invitationToken,
      locale: parsed.data.locale,
      requestId,
    });
    revalidatePath(`/platform-admin/${parsed.data.companyId}`);
    return {
      ok: true,
      data: {
        ...resent,
        invitationLink: delivery.invitationLink,
        emailDelivered: delivery.emailDelivered,
      },
      messageKey: delivery.emailDelivered
        ? "platformAdmin.resend.complete"
        : "platformAdmin.provision.emailFailed",
    };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function setCompanyStatusAction(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string; rowVersion: number }>> {
  const requestId = createRequestId();
  try {
    await requirePlatformAdmin(requestId);
    const parsed = validateActionInput(setCompanyStatusSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const data =
      parsed.data.status === "suspended"
        ? await commands.suspendCompany({
            companyId: parsed.data.companyId,
            expectedRowVersion: parsed.data.expectedRowVersion,
            reason: parsed.data.reason,
          })
        : await commands.reactivateCompany({
            companyId: parsed.data.companyId,
            expectedRowVersion: parsed.data.expectedRowVersion,
          });
    revalidatePath("/platform-admin");
    revalidatePath(`/platform-admin/${parsed.data.companyId}`);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
