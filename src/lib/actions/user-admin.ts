"use server";

import { revalidatePath } from "next/cache";
import { createRequestId, normalizeActionError } from "@/lib/actions/errors";
import { validateActionInput } from "@/lib/actions/validation";
import type { ActionResult } from "@/lib/actions/result";
import {
  deactivateMemberSchema,
  inviteUserSchema,
  setMemberRolesSchema,
} from "@/features/user-admin/application/validation";
import * as service from "@/features/user-admin/application/service";
import type {
  InviteUserResult,
  SetMemberRolesResult,
  UserAdminPageDto,
} from "@/features/user-admin/domain/types";

function revalidateUsers(locale: "en" | "ar") {
  revalidatePath(`/${locale}/settings/users`);
  revalidatePath("/settings/users");
}

export async function listUserAdminPageAction(): Promise<ActionResult<UserAdminPageDto>> {
  const requestId = createRequestId();
  try {
    const data = await service.listUserAdminPage();
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function inviteUserAction(input: unknown): Promise<ActionResult<InviteUserResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(inviteUserSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const data = await service.inviteUser(parsed.data);
    revalidateUsers(parsed.data.locale);
    return {
      ok: true,
      data,
      messageKey: data.emailDelivered
        ? "settings.users.invite.complete"
        : "settings.users.invite.emailFailed",
    };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function setMemberRolesAction(
  input: unknown,
): Promise<ActionResult<SetMemberRolesResult>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(setMemberRolesSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const data = await service.setMemberRoles(parsed.data);
    revalidateUsers(parsed.data.locale);
    return { ok: true, data };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deactivateMemberAction(
  input: unknown,
): Promise<ActionResult<{ userId: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deactivateMemberSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await service.deactivateMember(parsed.data);
    revalidateUsers(parsed.data.locale);
    return { ok: true, data: { userId: parsed.data.userId } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
