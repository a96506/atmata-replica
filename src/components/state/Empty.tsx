import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import {
  Empty as EmptyPrimitive,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Thin wrapper over the shared Empty primitive, preserving the existing
 * `title` / `description` / `action` call signature used across pages.
 */
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyPrimitive className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </EmptyPrimitive>
  );
}
