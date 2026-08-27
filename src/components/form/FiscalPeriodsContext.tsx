"use client";

import * as React from "react";
import type { PeriodLike } from "@/lib/period";

/**
 * Provides the real, DB-backed fiscal periods to every client component that
 * needs to resolve a date to a period status (DatePicker, DocActionBar). The
 * periods are fetched server-side in the app layout and threaded down here, so
 * the period lock always reflects the live fiscal calendar instead of a mock.
 */
const FiscalPeriodsContext = React.createContext<PeriodLike[] | null>(null);

export function FiscalPeriodsProvider({
  periods,
  children,
}: {
  periods: PeriodLike[];
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => periods, [periods]);
  return (
    <FiscalPeriodsContext.Provider value={value}>
      {children}
    </FiscalPeriodsContext.Provider>
  );
}

export function useFiscalPeriods(): PeriodLike[] {
  const periods = React.useContext(FiscalPeriodsContext);
  if (!periods) {
    throw new Error(
      "useFiscalPeriods must be used within a FiscalPeriodsProvider. The app layout should provide the real fiscal periods.",
    );
  }
  return periods;
}
