"use client";

import { useEffect } from "react";

/**
 * Warns the user on browser-close / refresh / locale-switch when `dirty` is true.
 *
 * Next.js App Router does not (as of Next 16) expose a stable hook to block
 * client-side navigations, so we cover the browser-leave case via
 * `beforeunload` and accept that in-app navigations will be guarded inside
 * the form's own Cancel/Discard handler via `useConfirm`.
 */
export function UnsavedChangesGuard({
  dirty,
  message = "You have unsaved changes. Leave the page?",
}: {
  dirty: boolean;
  message?: string;
}) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, message]);
  return null;
}
