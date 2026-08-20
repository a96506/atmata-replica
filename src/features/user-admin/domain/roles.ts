import {
  ALL_ROLES,
  ASSIGNABLE_USER_ROLES,
  type AssignableUserRole,
  type Role,
} from "@/types";

export { ALL_ROLES, ASSIGNABLE_USER_ROLES };
export type { AssignableUserRole };

const ASSIGNABLE_SET = new Set<string>(ASSIGNABLE_USER_ROLES);

export function isAssignableUserRole(value: string): value is AssignableUserRole {
  return ASSIGNABLE_SET.has(value);
}

export function normalizeRoles(roles: readonly string[]): AssignableUserRole[] {
  const unique = new Set<AssignableUserRole>();
  for (const role of roles) {
    if (!isAssignableUserRole(role)) {
      throw Object.assign(new Error("invalid human role set"), {
        code: role === "ai_agent" ? "ai_agent" : "unknown",
      });
    }
    unique.add(role);
  }
  return [...unique].sort();
}

export function isLastActiveOwner(member: {
  isOwner: boolean;
  active: boolean;
  roles: readonly Role[];
}, activeOwnerCount: number): boolean {
  return (
    member.isOwner &&
    member.active &&
    member.roles.includes("admin") &&
    activeOwnerCount <= 1
  );
}
