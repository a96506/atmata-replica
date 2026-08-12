"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import { buildSearchIndex } from "@/lib/api/search";
import { fuzzy, type ScoredResult } from "@/lib/search/match";
import type { SearchKind, SearchResult } from "@/types/search";

const RECENT_KEY = "atmata.search.recent";

const KIND_LABEL: Record<SearchKind, string> = {
  doc: "Doc",
  product: "Product",
  action: "Action",
  settings: "Settings",
};

const KIND_TONE: Record<SearchKind, string> = {
  doc: "bg-primary/10 text-primary",
  product: "bg-status-success-muted text-status-success-foreground",
  action: "bg-status-info-muted text-status-info-foreground",
  settings: "bg-muted text-foreground",
};

export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale ?? "en";
  const [index, setIndex] = React.useState<SearchResult[]>([]);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [recent, setRecent] = React.useState<SearchResult[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    buildSearchIndex().then(setIndex);
    try {
      const raw = window.sessionStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setQuery("");
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 10);
    // eslint-disable-next-line no-console
    console.info("atmata:event", "globalSearch.open");
  }, [open]);

  const results: ScoredResult[] = React.useMemo(() => fuzzy(index, query, 12), [index, query]);
  const visible: SearchResult[] = query.trim() ? results : recent.slice(0, 8);

  const select = (r: SearchResult) => {
    const href = r.href(locale);
    // Persist to recents (dedupe + cap).
    try {
      const dedup = [r, ...recent.filter((x) => x.id !== r.id)].slice(0, 8);
      window.sessionStorage.setItem(RECENT_KEY, JSON.stringify(dedup));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.info("atmata:event", "globalSearch.select", { id: r.id, kind: r.kind });
    onClose();
    router.push(href);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(visible.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = visible[active];
      if (r) select(r);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 p-4 pt-20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center border-b border-border px-3">
          <span aria-hidden className="mr-2 text-muted-foreground">⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Search docs, products, actions… (Esc to close)"
            className="w-full bg-transparent px-2 py-3 text-sm focus:outline-none"
            aria-label="Global search"
          />
          <span className="hidden text-xs text-muted-foreground sm:inline">⌘K</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query.trim() ? "No matches." : "Type to search, or pick a recent."}
            </div>
          ) : (
            <ul role="listbox">
              {!query.trim() ? (
                <li className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent
                </li>
              ) : null}
              {visible.map((r, i) => {
                const isActive = i === active;
                return (
                  <li key={r.id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onClick={() => select(r)}
                      onMouseEnter={() => setActive(i)}
                      className={
                        "flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left " +
                        (isActive ? "bg-primary/10" : "hover:bg-muted")
                      }
                    >
                      <span
                        className={
                          "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                          KIND_TONE[r.kind]
                        }
                      >
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {r.label}
                        </span>
                        {r.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑ ↓ navigate · Enter select · Esc close</span>
          <span>{index.length} items indexed</span>
        </footer>
      </div>
    </div>
  );
}
