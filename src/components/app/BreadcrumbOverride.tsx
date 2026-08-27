"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

type BreadcrumbLabel = { pathname: string | null; label: string | null };

const BreadcrumbOverrideContext = React.createContext<{
  label: BreadcrumbLabel;
  setLabel: (label: BreadcrumbLabel) => void;
}>({
  label: { pathname: null, label: null },
  setLabel: () => {},
});

export function BreadcrumbOverrideProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [label, setLabel] = React.useState<BreadcrumbLabel>({
    pathname: null,
    label: null,
  });
  const value = React.useMemo(
    () => ({ label, setLabel }),
    [label],
  );
  return (
    <BreadcrumbOverrideContext.Provider value={value}>
      {children}
    </BreadcrumbOverrideContext.Provider>
  );
}

export function useBreadcrumbLabel(pathname: string): string | null {
  const ctx = React.useContext(BreadcrumbOverrideContext);
  if (ctx.label.pathname !== pathname) return null;
  return ctx.label.label;
}

export function useSetBreadcrumbLabel() {
  const ctx = React.useContext(BreadcrumbOverrideContext);
  return ctx.setLabel;
}

/**
 * Publish a human-readable label (e.g. the document number) for the trailing
 * breadcrumb crumb of the current pathname, replacing the raw record id that
 * appears in the URL. Clears the override on unmount.
 */
export function useBreadcrumbDocLabel(label: string | null | undefined) {
  const pathname = usePathname();
  const setLabel = useSetBreadcrumbLabel();
  React.useEffect(() => {
    if (!label) return;
    setLabel({ pathname, label });
    return () => {
      setLabel({ pathname: null, label: null });
    };
  }, [label, pathname, setLabel]);
}

