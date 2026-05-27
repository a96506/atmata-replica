"use client";

import { useId, useMemo, useState } from "react";

export type SearchSelectOption = {
  value: string;
  label: string;
  hint?: string;
  /** Status badges shown beside the label — e.g. "credit hold", "lot-tracked". */
  badges?: { label: string; tone?: "red" | "amber" | "slate" | "emerald" }[];
  disabled?: boolean;
  disabledReason?: string;
};

export type SearchSelectProps = {
  value: string | null;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  label: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  /** Field tip rendered under the label (e.g. "Defaulted from supplier"). */
  hint?: string;
};

const BADGE_TONE: Record<string, string> = {
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-900",
  slate: "bg-slate-100 text-slate-700",
  emerald: "bg-emerald-100 text-emerald-900",
};

export function SearchSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Search…",
  required,
  disabled,
  error,
  hint,
}: SearchSelectProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.hint?.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={
          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border bg-white px-3 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 " +
          (error ? "border-red-400" : "border-slate-300")
        }
      >
        {selected ? (
          <span className="flex flex-1 items-center gap-2 truncate">
            <span className="truncate">{selected.label}</span>
            {selected.badges?.map((b) => (
              <span
                key={b.label}
                className={
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                  (BADGE_TONE[b.tone ?? "slate"] ?? BADGE_TONE.slate)
                }
              >
                {b.label}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="text-slate-400">▾</span>
      </button>
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      {open ? (
        <div className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full border-b border-slate-100 px-3 py-2 text-sm focus:outline-none"
          />
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400">
              No results.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100" role="listbox">
              {filtered.map((o) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={
                    "px-3 py-2 text-sm " +
                    (o.disabled
                      ? "cursor-not-allowed text-slate-400"
                      : "cursor-pointer hover:bg-slate-50")
                  }
                  title={o.disabledReason}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{o.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {o.badges?.map((b) => (
                        <span
                          key={b.label}
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-medium " +
                            (BADGE_TONE[b.tone ?? "slate"] ?? BADGE_TONE.slate)
                          }
                        >
                          {b.label}
                        </span>
                      ))}
                    </span>
                  </div>
                  {o.hint ? (
                    <div className="text-xs text-slate-500">{o.hint}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
