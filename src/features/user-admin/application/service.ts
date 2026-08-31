import "server-only";

import { KnownActionError } from "@/lib/actions/errors";
import { getAppSession } from "@/lib/insforge/session";
import { sendTransactionalEmail } from "@/lib/actions/email";
import { deriveInvitationToken, hashInvitationToken, invitationLink } from "./token";
import { parseInviteInput, parseRoleUpdate } from "./validation";
import * as repo from "../infrastructure/insforge-user-admin-repository";
import type {
  InviteUserResult,
  SetMemberRolesResult,
  UserAdminPageDto,
} from "../domain/types";

async function requireAdmin() {
  const result = await getAppSession();
  if (result.reason === "unauthenticated" || !result.session) {
    throw new KnownActionError("UNAUTHENTICATED");
  }
  if (!result.session.roles.includes("admin")) {
    throw new KnownActionError("FORBIDDEN");
  }
  return result.session;
}

export async function listUserAdminPage(): Promise<UserAdminPageDto> {
  const session = await requireAdmin();
  const members = await repo.listMembers(session.companyId);
  const profiles = await repo.listProfiles(members.map((member) => member.user_id));
  const invitations = await repo.listPendingInvitations(session.companyId);
  const merged = repo.mergeMembers(members, profiles);
  return {
    members: merged,
    pendingInvitations: repo.mapInvitations(invitations),
    currentUserId: session.user.id,
    activeOwnerCount: merged.filter(
      (member) => member.isOwner && member.active && member.roles.includes("admin"),
    ).length,
  };
}

export async function inviteUser(input: {
  locale: "en" | "ar";
  email: string;
  roles: string[];
  requestId: string;
}): Promise<InviteUserResult> {
  const session = await requireAdmin();
  const parsed = parseInviteInput(input);
  const rawToken = deriveInvitationToken({
    companyId: session.companyId,
    email: parsed.email,
    requestId: parsed.requestId,
  });
  const invited = await repo.inviteUser({
    email: parsed.email,
    roles: parsed.roles,
    requestId: parsed.requestId,
    tokenHash: hashInvitationToken(rawToken),
  });
  const link = invitationLink(rawToken, parsed.locale);
  const sent = await sendTransactionalEmail({
    event: "user_invitation",
    invitationId: invited.id,
    invitationToken: rawToken,
    locale: parsed.locale,
    idempotencyKey: `user-invite:${invited.id}:${parsed.requestId}`,
  });
  return {
    invitationId: invited.id,
    email: invited.email,
    invitationLink:
      sent.ok &&
      "invitationLink" in sent.data &&
      sent.data.invitationLink
        ? sent.data.invitationLink
        : link,
    emailDelivered: sent.ok,
    requestId: parsed.requestId,
  };
}

export async function setMemberRoles(input: {
  locale: "en" | "ar";
  userId: string;
  roles: string[];
}): Promise<SetMemberRolesResult> {
  const session = await requireAdmin();
  const parsed = parseRoleUpdate(input);
  await repo.setMemberRoles(parsed.userId, parsed.roles);
  return {
    userId: parsed.userId,
    roles: parsed.roles,
    lostAdmin: parsed.userId === session.user.id && !parsed.roles.includes("admin"),
  };
}

export async function deactivateMember(input: { locale: "en" | "ar"; userId: string }): Promise<void> {
  const session = await requireAdmin();
  if (input.userId === session.user.id) {
    throw new KnownActionError("FORBIDDEN", {
      messageKey: "settings.users.errors.selfDeactivate",
    });
  }
  await repo.deactivateMember(input.userId);
}
