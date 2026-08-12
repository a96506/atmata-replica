import type { ReactNode } from "react";

/**
 * Module navigation now lives in the sidebar (see `@/config/navigation`), so
 * this layout is a pass-through kept for route-segment grouping.
 */
export default function InventoryLayout({ children }: { children: ReactNode }) {
  return children;
}
