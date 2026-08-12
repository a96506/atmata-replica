import type { ReactNode } from "react";
import { AttachmentsTab } from "./AttachmentsTab";

/**
 * Helper to keep DocumentLayout.tabs[] declarations one-liners.
 * Returns the standard Attachments tab spec bound to a specific document.
 * The AttachmentsTab Client Component fetches its own list on mount and
 * handles upload / download / delete via Server Actions.
 */
export function attachmentsTab(
  docType: string,
  docId: string,
): { id: string; label: string; content: ReactNode } {
  return {
    id: "attachments",
    label: "Attachments",
    content: <AttachmentsTab docType={docType} docId={docId} />,
  };
}
