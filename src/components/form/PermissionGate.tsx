"use client";

import type { ReactNode } from "react";
import {
  rolesForOperation,
  type OperationKey,
} from "@/lib/roles/capabilities";
import { useSession } from "@/lib/session";
import type { Role } from "@/types";

type PermissionGateBase = {
  rationale: string;
  children: ReactNode;
};

type PermissionGateProps = PermissionGateBase &
  (
    | { operation: OperationKey; allow?: Role[] }
    | { allow: Role[]; operation?: OperationKey }
  );

/**
 * Renders `children` only when the current session role is allowed.
 * Prefer `operation` (derives roles from capabilities); `allow` remains an
 * escape hatch for read-only / non-RPC pages.
 */
export function PermissionGate({
  allow,
  operation,
  rationale,
  children,
}: PermissionGateProps) {
  const { role } = useSession();
  const allowedRoles = operation ? rolesForOperation(operation) : (allow ?? []);

  if (role === "admin" || allowedRoles.includes(role)) {
    return <>{children}</>;
  }
  return (
    <div className="rounded-xl border border-status-pending-border bg-status-pending-muted p-8 text-status-pending-foreground">
      <div className="text-base font-semibold">Permission required</div>
      <div className="mt-1 text-sm">{rationale}</div>
      <div className="mt-4 rounded-md border border-status-pending-border bg-card p-3 text-xs text-foreground">
        <div className="font-medium">You are signed in as:</div>
        <div className="mt-1">
          <span className="rounded bg-muted px-2 py-0.5 font-mono">{role}</span>
        </div>
        <div className="mt-2 font-medium">Roles that can access:</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {allowedRoles.map((r) => (
            <span
              key={r}
              className="rounded bg-status-success-muted px-2 py-0.5 font-mono text-status-success-foreground"
            >
              {r}
            </span>
          ))}
        </div>
        <div className="mt-3 text-muted-foreground">
          Use the dev role switcher (bottom-right) to test other roles, or ask
          your admin to grant access.
        </div>
      </div>
    </div>
  );
}
