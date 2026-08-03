"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
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
    <>
      {/* Wide screens: a search affordance that advertises the shortcut. */}
      <Button
        variant="outline"
        onClick={ctx.open}
        className="text-muted-foreground hidden h-8 w-56 justify-start gap-2 px-2.5 font-normal lg:flex"
      >
        <Search />
        <span>Search</span>
        <Kbd className="ms-auto">⌘K</Kbd>
      </Button>
      {/* Narrow screens: icon only. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={ctx.open}
        className="lg:hidden"
        aria-label="Open global search"
      >
        <Search />
      </Button>
    </>
  );
}
