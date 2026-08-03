import { formatMoney } from "@/lib/money";
import type { Currency, TaxCode } from "@/types";

export type TaxBreakdownLine = {
  qty: number;
  unitPrice: number;
  taxCodeId?: string | null;
  discount?: number;
};

export function TaxBreakdown({
  lines,
  currency,
  taxCodes,
}: {
  lines: TaxBreakdownLine[];
  currency: Currency;
  taxCodes: TaxCode[];
}) {
  let subtotal = 0;
  const taxMap = new Map<string, { code: string; rate: number; base: number; tax: number }>();
  for (const l of lines) {
    const net = l.qty * l.unitPrice - (l.discount ?? 0);
    subtotal += net;
    if (l.taxCodeId) {
      const tc = taxCodes.find((t) => t.id === l.taxCodeId);
      if (!tc) continue;
      const cur = taxMap.get(tc.id) ?? { code: tc.code, rate: tc.rate, base: 0, tax: 0 };
      cur.base += net;
      cur.tax += net * tc.rate;
      taxMap.set(tc.id, cur);
    }
  }
  const taxTotal = [...taxMap.values()].reduce((acc, b) => acc + b.tax, 0);

  return (
    <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
      </div>
      {[...taxMap.values()].map((b) => (
        <div key={b.code} className="mt-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {b.code} · {(b.rate * 100).toFixed(0)}% on {formatMoney(b.base, currency)}
          </span>
          <span className="tabular-nums">{formatMoney(b.tax, currency)}</span>
        </div>
      ))}
      {taxMap.size === 0 ? (
        <div className="mt-1 text-xs text-muted-foreground">No tax codes applied (exempt).</div>
      ) : null}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="font-medium text-foreground">Total</span>
        <span className="text-base font-semibold tabular-nums">
          {formatMoney(subtotal + taxTotal, currency)}
        </span>
      </div>
    </div>
  );
}
