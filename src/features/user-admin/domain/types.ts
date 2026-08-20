import type { AssignableUserRole, Role } from "@/types";

export type CompanyMemberAdminDto = {
  userId: string;
  fullName: string;
  email: string;
  roles: Role[];
  isOwner: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PendingInvitationDto = {
  id: string;
  email: string;
  roles: Role[];
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
};

export type UserAdminPageDto = {
  members: CompanyMemberAdminDto[];
  pendingInvitations: PendingInvitationDto[];
  currentUserId: string;
  activeOwnerCount: number;
};

export type InviteUserResult = {
  invitationId: string;
  email: string;
  invitationLink: string;
  emailDelivered: boolean;
  requestId: string;
};

export type SetMemberRolesResult = {
  userId: string;
  roles: AssignableUserRole[];
  lostAdmin: boolean;
};
