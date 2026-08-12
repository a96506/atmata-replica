import type { TaxJurisdiction } from "@/types";

export type TaxCode = {
  id: string;
  jurisdiction: TaxJurisdiction;
  name: { en: string; ar: string };
  rate: number;
  isInput: boolean;
  isOutput: boolean;
};

export type DocLine = {
  qty: number;
  unitPrice: number;
  taxCodeId?: string | null;
  discount?: number;
};

export type DocTotals = {
  subtotal: number;
  taxTotal: number;
  total: number;
  taxBreakdown: Array<{ taxCodeId: string; base: number; tax: number }>;
};

export function calcLineNet(line: DocLine): number {
  return line.qty * line.unitPrice - (line.discount ?? 0);
}

export function calcLineTax(line: DocLine, taxCodes: TaxCode[]): number {
  if (!line.taxCodeId) return 0;
  const tc = taxCodes.find((t) => t.id === line.taxCodeId);
  if (!tc) return 0;
  return calcLineNet(line) * tc.rate;
}

export function calcDocTotals(lines: DocLine[], taxCodes: TaxCode[]): DocTotals {
  let subtotal = 0;
  const taxMap = new Map<string, { base: number; tax: number }>();
  for (const l of lines) {
    const net = calcLineNet(l);
    subtotal += net;
    if (l.taxCodeId) {
      const tc = taxCodes.find((t) => t.id === l.taxCodeId);
      if (tc) {
        const cur = taxMap.get(tc.id) ?? { base: 0, tax: 0 };
        cur.base += net;
        cur.tax += net * tc.rate;
        taxMap.set(tc.id, cur);
      }
    }
  }
  const taxTotal = [...taxMap.values()].reduce((acc, b) => acc + b.tax, 0);
  return {
    subtotal,
    taxTotal,
    total: subtotal + taxTotal,
    taxBreakdown: [...taxMap.entries()].map(([taxCodeId, b]) => ({
      taxCodeId,
      base: b.base,
      tax: b.tax,
    })),
  };
}
