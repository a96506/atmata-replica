"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import type { Role } from "@/types";

/**
 * Renders `children` only when the current session role is in `allow`. Otherwise
 * shows a "permission denied" empty state with a role-explanation card.
 */
export function PermissionGate({
  allow,
  rationale,
  children,
}: {
  allow: Role[];
  rationale: string;
  children: ReactNode;
}) {
  const { role } = useSession();
  if (role === "admin" || allow.includes(role)) {
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
          {allow.map((r) => (
            <span key={r} className="rounded bg-status-success-muted px-2 py-0.5 font-mono text-status-success-foreground">
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
