import type { ReactNode } from "react";
import { AttachmentsTab } from "./AttachmentsTab";

/**
 * Helper to keep DocumentLayout.tabs[] declarations one-liners.
 * Returns the standard Attachments tab spec — seed data is intentionally
 * empty in the demo; backend will hydrate from real storage.
 */
export function attachmentsTab(): { id: string; label: string; content: ReactNode } {
  return {
    id: "attachments",
    label: "Attachments",
    content: <AttachmentsTab />,
  };
}
