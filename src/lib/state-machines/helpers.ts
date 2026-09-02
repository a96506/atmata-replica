import {
  rolesForCapability,
  type WriteCapability,
} from "@/lib/roles/capabilities";
import type { DocState, Role } from "@/types";

export type ActionDef = {
  id: string;
  label: string;
  toState: DocState;
  roles: Role[];
  capability?: WriteCapability;
  destructive?: boolean;
};

/** Union of roles across one or more write capabilities (deduped, stable order). */
export function capRoles(...caps: WriteCapability[]): Role[] {
  const seen = new Set<Role>();
  const out: Role[] = [];
  for (const cap of caps) {
    for (const role of rolesForCapability(cap)) {
      if (seen.has(role)) continue;
      seen.add(role);
      out.push(role);
    }
  }
  return out;
}

/** Single-capability action: sets `capability` and derives `roles` for backwards compat. */
export function withCap(
  capability: WriteCapability,
  action: Omit<ActionDef, "roles" | "capability"> & { roles?: Role[] },
): ActionDef {
  return {
    ...action,
    capability,
    roles: action.roles ?? rolesForCapability(capability),
  };
}
