"use client";

import { SearchSelect } from "./SearchSelect";

export type LotOption = {
  lotNumber: string;
  qtyAvailable: number;
  expiry?: string;
};

export type LotPickerProps = {
  value: string | null;
  onChange: (lotNumber: string) => void;
  lots: LotOption[];
  required?: boolean;
  error?: string | null;
};

/**
 * Picker for lot-tracked products. Lists available lots with qty + expiry,
 * sorted FEFO (first-expiry-first-out). Required for lot-tracked products
 * on GRN / DN / Transfer / Adjustment lines.
 */
export function LotPicker({ value, onChange, lots, required, error }: LotPickerProps) {
  const sorted = [...lots].sort((a, b) => {
    if (!a.expiry && !b.expiry) return 0;
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.localeCompare(b.expiry);
  });

  const options = sorted.map((l, i) => ({
    value: l.lotNumber,
    label: l.lotNumber,
    hint:
      `${l.qtyAvailable} available` +
      (l.expiry ? ` · expires ${l.expiry}${i === 0 ? " (FEFO)" : ""}` : ""),
    badges: l.expiry && new Date(l.expiry) < new Date()
      ? ([{ label: "expired", tone: "red" as const }])
      : i === 0 && l.expiry
        ? ([{ label: "FEFO", tone: "emerald" as const }])
        : undefined,
    disabled: l.qtyAvailable <= 0,
    disabledReason: l.qtyAvailable <= 0 ? "Lot empty" : undefined,
  }));

  return (
    <SearchSelect
      label="Lot"
      placeholder="Select lot…"
      required={required}
      value={value}
      onChange={onChange}
      options={options}
      error={error}
      hint={lots.length === 0 ? "No lots available — receive stock first." : undefined}
    />
  );
}
