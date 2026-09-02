"use client";

import {
  canAnyOperation,
  type OperationKey,
} from "@/lib/roles/capabilities";
import { useSession } from "@/lib/session";

/**
 * Whether the current session may perform an OPERATIONS key.
 * Uses stacked `roles[]` (same as AppSidebar / RFQ award gates).
 * Pass null/undefined to treat as always allowed (ungated CTA).
 */
export function useCanOperation(
  operation: OperationKey | null | undefined,
): boolean {
  const { roles } = useSession();
  if (!operation) return true;
  return canAnyOperation(roles, operation);
}
