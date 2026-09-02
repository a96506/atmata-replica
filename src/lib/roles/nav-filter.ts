import type { NavGroup, NavLeaf, NavModule } from "@/config/navigation";
import type { Role } from "@/types";
import { canAny, type WriteCapability } from "./capabilities";

/**
 * Whether a leaf is visible for the given session roles.
 *
 * - Untagged leaf (no capabilities / readRoles) → visible to all signed-in users.
 * - Tagged leaf → visible if admin, any readRole match, or canAny(capability).
 */
export function leafVisible(
  leaf: Pick<NavLeaf, "capabilities" | "readRoles">,
  roles: readonly Role[],
): boolean {
  if (roles.includes("admin")) return true;

  const caps = leaf.capabilities;
  const reads = leaf.readRoles;
  if ((!caps || caps.length === 0) && (!reads || reads.length === 0)) {
    return true;
  }

  if (reads?.some((r) => roles.includes(r))) return true;
  if (caps?.some((cap: WriteCapability) => canAny(roles, cap))) return true;
  return false;
}

function filterGroup(group: NavGroup, roles: readonly Role[]): NavGroup | null {
  const items = group.items.filter((item) => leafVisible(item, roles));
  if (items.length === 0) return null;
  return { ...group, items };
}

/**
 * Role-aware copy of `navigation`. Drops empty groups and modules with no
 * remaining leaves. Does not mutate the source config.
 */
export function filterNavigation(
  modules: readonly NavModule[],
  roles: readonly Role[],
): NavModule[] {
  const out: NavModule[] = [];
  for (const mod of modules) {
    const groups = mod.groups
      .map((g) => filterGroup(g, roles))
      .filter((g): g is NavGroup => g !== null);
    if (groups.length === 0) continue;
    out.push({ ...mod, groups });
  }
  return out;
}
