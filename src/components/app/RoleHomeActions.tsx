"use client";

import Link from "next/link";
import {
  canAnyOperation,
  type OperationKey,
} from "@/lib/roles/capabilities";
import { useSession } from "@/lib/session";

export type RoleHomeAction = {
  label: string;
  href: string;
  /** When set, hide unless the session may perform this operation. */
  operation?: OperationKey;
  /** Primary styling for the main create action on a role home. */
  primary?: boolean;
};

/**
 * 3–5 real route links on role landing pages — gated with the same
 * OPERATIONS map as NewDocButton / PermissionGate.
 */
export function RoleHomeActions({ actions }: { actions: RoleHomeAction[] }) {
  const { roles } = useSession();
  const visible = actions.filter(
    (a) => !a.operation || canAnyOperation(roles, a.operation),
  );
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((a) => (
        <Link
          key={`${a.href}:${a.label}`}
          href={a.href}
          className={
            a.primary
              ? "inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted hover:text-primary"
          }
        >
          {a.primary ? `+ ${a.label}` : a.label}
        </Link>
      ))}
    </div>
  );
}
