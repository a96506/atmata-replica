"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

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
  /**
   * Optional cmdk filter override. When omitted, cmdk's default fuzzy
   * subsequence filter is used. Pass {@link strictPrefixFilter} (or a custom
   * scorer) to require prefix/substring relevance — e.g. account pickers where
   * "Retained" must not match "Depreciation expense" and "1000" must not match
   * "2000".
   */
  filter?: (value: string, search: string) => number;
};

/**
 * Relevance-threshold filter for SearchSelect: rejects low-relevance fuzzy
 * subsequence matches. A row matches when:
 *  - the query is a substring of the rendered value (text searches), OR
 *  - a whitespace/`·`/`/`-delimited token starts with the query (numeric code
 *    searches — so "1000" matches "1000 · Cash" but not "21000 · …").
 * Empty query matches everything. Returns a rank (1 = match, 0 = exclude);
 * cmdk treats 0 as filtered out.
 */
export function strictPrefixFilter(value: string, search: string): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  const v = value.toLowerCase();
  if (/^\d+$/.test(q)) {
    const tokens = v.split(/[\s·/]+/);
    return tokens.some((t) => t.startsWith(q)) ? 1 : 0;
  }
  return v.includes(q) ? 1 : 0;
}

/** Badge tones resolve to the shared status tokens so they theme correctly. */
const BADGE_TONE: Record<string, string> = {
  red: "bg-status-danger-muted text-status-danger-foreground border-status-danger-border",
  amber:
    "bg-status-pending-muted text-status-pending-foreground border-status-pending-border",
  slate: "bg-muted text-muted-foreground border-transparent",
  emerald:
    "bg-status-success-muted text-status-success-foreground border-status-success-border",
};

function OptionBadges({ badges }: { badges: SearchSelectOption["badges"] }) {
  if (!badges?.length) return null;
  return (
    <span className="flex shrink-0 gap-1">
      {badges.map((b) => (
        <Badge
          key={b.label}
          variant="outline"
          className={cn("text-[11px]", BADGE_TONE[b.tone ?? "slate"])}
        >
          {b.label}
        </Badge>
      ))}
    </span>
  );
}

/**
 * Type-ahead picker for reference data (suppliers, products, accounts).
 * Built on Command so keyboard navigation, filtering, and ARIA wiring are
 * handled by the primitive rather than re-implemented per call site.
 */
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
  filter,
}: SearchSelectProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" *"}
          </span>
        ) : null}
      </FieldLabel>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{selected.label}</span>
                <OptionBadges badges={selected.badges} />
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command filter={filter}>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                    disabled={o.disabled}
                    title={o.disabledReason}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        o.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">{o.label}</span>
                        <OptionBadges badges={o.badges} />
                      </span>
                      {o.hint ? (
                        <span className="text-muted-foreground text-xs">
                          {o.hint}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      {error ? (
        <FieldDescription className="text-destructive">{error}</FieldDescription>
      ) : null}
    </Field>
  );
}
