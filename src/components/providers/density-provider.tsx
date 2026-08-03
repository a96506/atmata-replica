"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Density = "compact" | "comfortable";

const STORAGE_KEY = "erp-density";

type DensityContextValue = {
  density: Density;
  setDensity: (density: Density) => void;
};

const DensityContext = createContext<DensityContextValue | null>(null);

/**
 * Row-height / control-height density, written to `data-density` on `<html>` so
 * the CSS custom properties in `globals.css` drive every surface at once.
 */
export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>("compact");

  // Read the persisted preference after mount to avoid hydration mismatches.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "compact" || stored === "comfortable") {
      setDensityState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity() {
  const context = useContext(DensityContext);
  if (!context) {
    throw new Error("useDensity must be used within a DensityProvider");
  }
  return context;
}
