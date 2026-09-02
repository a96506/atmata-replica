import type { Role } from "@/types";

/** Roles that see roadmap deferral copy instead of a generic empty message. */
const ROADMAP_ROLES = new Set<Role>(["buyer", "admin"]);

export function showsDeferredRoadmap(role: Role, roles: readonly Role[]): boolean {
  if (ROADMAP_ROLES.has(role)) return true;
  return roles.some((r) => ROADMAP_ROLES.has(r));
}

export type DeferredMessageKey = "comingSoonGeneric" | "comingSoonRoadmap";

export function deferredMessageKey(
  role: Role,
  roles: readonly Role[],
): DeferredMessageKey {
  return showsDeferredRoadmap(role, roles) ? "comingSoonRoadmap" : "comingSoonGeneric";
}
