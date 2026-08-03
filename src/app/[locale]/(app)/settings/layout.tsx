import type { ReactNode } from "react";

/**
 * Module navigation now lives in the sidebar (see `@/config/navigation`), which
 * groups these routes under Organization / Finance / Master data / Access
 * instead of the previous 18-item horizontal scroll strip.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
