import "server-only";

import { KnownActionError } from "@/lib/actions/errors";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { parseUserAdminRpcError } from "../domain/errors";
import type { AssignableUserRole, Role } from "@/types";
import type { CompanyMemberAdminDto, PendingInvitationDto } from "../domain/types";

type RpcError = { message?: string; code?: string } | null;

type MemberRow = {
  user_id: string;
  roles: Role[];
  is_owner: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  locale: string | null;
  active: boolean | null;
};

type InvitationRow = {
  id: string;
  email: string;
  roles: Role[];
  status: string;
  expires_at: string;
  created_at: string;
  invited_by: string | null;
};

type InviteRpcResult = {
  id: string;
  email: string;
  expiresAt?: string;
  requestId?: string;
  isOwner?: boolean;
};

function throwRpc(error: RpcError): never {
  throw new KnownActionError(parseUserAdminRpcError(error?.message));
}

export async function listMembers(companyId: string): Promise<MemberRow[]> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database
    .from("company_members")
    .select("user_id,roles,is_owner,active,created_at,updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throwRpc(error);
  return (data ?? []) as MemberRow[];
}

export async function listProfiles(userIds: string[]): Promise<ProfileRow[]> {
  if (userIds.length === 0) return [];
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database
    .from("user_profiles")
    .select("id,full_name,email,locale,active")
    .in("id", userIds);
  if (error) throwRpc(error);
  return (data ?? []) as ProfileRow[];
}

export async function listPendingInvitations(companyId: string): Promise<InvitationRow[]> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database
    .from("invitations")
    .select("id,email,roles,status,expires_at,created_at,invited_by")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throwRpc(error);
  return (data ?? []) as InvitationRow[];
}

export function mergeMembers(
  members: MemberRow[],
  profiles: ProfileRow[],
): CompanyMemberAdminDto[] {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return members.map((member) => {
    const profile = byId.get(member.user_id);
    const email = profile?.email?.trim() || `${member.user_id}@unknown.local`;
    const fullName = profile?.full_name?.trim() || email;
    return {
      userId: member.user_id,
      fullName,
      email,
      roles: member.roles,
      isOwner: member.is_owner,
      active: member.active,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    };
  });
}

export function mapInvitations(rows: InvitationRow[]): PendingInvitationDto[] {
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    roles: row.roles,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    invitedBy: row.invited_by,
  }));
}

export async function inviteUser(input: {
  email: string;
  roles: AssignableUserRole[];
  requestId: string;
  tokenHash: string;
}): Promise<InviteRpcResult> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database.rpc("invite_user", {
    p_email: input.email,
    p_roles: input.roles,
    p_request_id: input.requestId,
    p_token_hash: input.tokenHash,
  });
  if (error) throwRpc(error);
  if (!data || typeof data !== "object") {
    throw new KnownActionError("INTERNAL");
  }
  return data as InviteRpcResult;
}

export async function setMemberRoles(userId: string, roles: AssignableUserRole[]): Promise<void> {
  const client = await createInsForgeServerClient();
  const { error } = await client.database.rpc("set_member_roles", {
    p_user_id: userId,
    p_roles: roles,
  });
  if (error) throwRpc(error);
}

export async function deactivateMember(userId: string): Promise<void> {
  const client = await createInsForgeServerClient();
  const { error } = await client.database.rpc("deactivate_member", {
    p_user_id: userId,
  });
  if (error) throwRpc(error);
}
