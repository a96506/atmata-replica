"use client";

import * as React from "react";
import { GlobalSearch } from "./GlobalSearch";

const GlobalSearchContext = React.createContext<{
  open: () => void;
} | null>(null);

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <GlobalSearchContext.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      <GlobalSearch open={isOpen} onClose={() => setIsOpen(false)} />
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  return React.useContext(GlobalSearchContext);
}

export function GlobalSearchTrigger() {
  const ctx = useGlobalSearch();
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.open}
      className="hidden cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 md:inline-flex"
      aria-label="Open global search"
    >
      <span aria-hidden>⌕</span>
      <span>Search</span>
      <span className="ml-1 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">⌘K</span>
    </button>
  );
}
