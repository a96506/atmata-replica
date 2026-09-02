"use client";

import Link from "next/link";
import type { OperationKey } from "@/lib/roles/capabilities";
import { useCanOperation } from "@/lib/roles/use-can-operation";

export type CreateChildLink = {
  label: string;
  href: string;
};

export function CreateChildLinks({ links }: { links: CreateChildLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Quick actions
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="cursor-pointer rounded-md border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted hover:text-primary"
          >
            + {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function NewDocButton({
  href,
  label,
  operation,
}: {
  href: string;
  label: string;
  /** When set, hide the CTA unless the session may perform this operation. */
  operation?: OperationKey;
}) {
  const allowed = useCanOperation(operation);
  if (!allowed) return null;

  return (
    <Link
      href={href}
      className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      + {label}
    </Link>
  );
}
