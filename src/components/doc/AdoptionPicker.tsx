"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import {
  stashAdoptionContext,
  recordAdoptions,
} from "@/lib/api/adoption";
import type {
  AdoptionContext,
  AdoptionEdge,
  AdoptionParent,
  AdoptionParentLine,
  DocType,
  Money,
} from "@/types";

/**
 * AdoptionPicker — line-level selector used whenever a user wants to
 * "adopt" lines from one or more parent documents into a new child doc.
 *
 * - Per-line checkbox + qty override (clamped to maxQty).
 * - Multi-parent merging: when more than one parent is passed, lines
 *   sharing the same productId are visually grouped in the preview pane.
 * - On Continue: stashes an AdoptionContext in sessionStorage and
 *   navigates to the target /new form (which reads the stash on mount).
 */

const TARGET_HREF: Partial<Record<DocType, (locale: string) => string>> = {
  rfq: (l) => `/${l}/purchasing/rfqs/new`,
  po: (l) => `/${l}/purchasing/purchase-orders/new`,
  grn: (l) => `/${l}/purchasing/goods-receipts/new`,
  vendor_bill: (l) => `/${l}/purchasing/bills/new`,
  vendor_payment: (l) => `/${l}/purchasing/payments/new`,
  vendor_return: (l) => `/${l}/purchasing/vendor-returns/new`,
  debit_note: (l) => `/${l}/purchasing/debit-notes/new`,
  so: (l) => `/${l}/sales/orders/new`,
  dn: (l) => `/${l}/sales/deliveries/new`,
  customer_invoice: (l) => `/${l}/sales/invoices/new`,
  customer_receipt: (l) => `/${l}/sales/receipts/new`,
  customer_return: (l) => `/${l}/sales/returns/new`,
  credit_note: (l) => `/${l}/sales/credit-notes/new`,
};

export type AdoptionPickerProps = {
  locale: string;
  targetType: DocType;
  parents: AdoptionParent[];
  /** Display currency for the totals preview. */
  currency: import("@/types").Currency;
  open: boolean;
  onClose: () => void;
  /** Number of intermediate doc types being skipped (0 = direct adoption). */
  hops?: number;
};

type DraftLine = AdoptionParentLine & {
  parentDocType: DocType;
  parentDocId: string;
  parentDocNumber: string;
};

export function AdoptionPicker({
  locale,
  targetType,
  parents,
  currency,
  open,
  onClose,
  hops = 0,
}: AdoptionPickerProps) {
  const router = useRouter();
  const t = useTranslations("adoption");
  const [draft, setDraft] = React.useState<DraftLine[]>(() => buildDraft(parents));

  // Reset draft each time the picker re-opens with a different parent set.
  React.useEffect(() => {
    setDraft(buildDraft(parents));
  }, [parents]);

  if (!open) return null;

  const selected = draft.filter((l) => l.selected && l.qty > 0);
  const subtotal = selected.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const update = (idx: number, patch: Partial<DraftLine>) => {
    setDraft((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const continueToForm = async () => {
    if (selected.length === 0) {
      toast.error(t("noSelection"));
      return;
    }
    const ctx: AdoptionContext = {
      targetType,
      createdAt: new Date().toISOString(),
      parents: parents.map((p) => ({
        ...p,
        lines: draft
          .filter((d) => d.parentDocId === p.docId)
          .map<AdoptionParentLine>((d) => ({
            lineId: d.lineId,
            productId: d.productId,
            description: d.description,
            unitPrice: d.unitPrice,
            taxCodeId: d.taxCodeId,
            selected: d.selected,
            qty: d.qty,
            maxQty: d.maxQty,
            note: d.note,
          })),
      })),
    };
    stashAdoptionContext(ctx);

    // Record edges (toast-only persistence — backend will wire).
    const now = new Date().toISOString();
    const edges: AdoptionEdge[] = selected.map((l) => {
      const value: Money = { amount: l.qty * l.unitPrice, currency };
      return {
        from: { docType: l.parentDocType, docId: l.parentDocId, lineId: l.lineId },
        to: { docType: targetType, docId: "(pending)" },
        qty: l.qty,
        value,
        createdAt: now,
      };
    });
    await recordAdoptions(edges);

    // eslint-disable-next-line no-console
    console.info("atmata:event", "adoption.continue", {
      targetType,
      parentCount: parents.length,
      lineCount: selected.length,
    });

    const href = TARGET_HREF[targetType]?.(locale);
    if (!href) {
      toast.error(`No /new form wired for ${targetType} yet.`);
      return;
    }
    onClose();
    router.push(href);
  };

  // Preview pane: lines merged by productId across parents.
  const preview = mergePreview(selected);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="grid max-h-[90vh] w-full max-w-5xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("title")}
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {translateTarget(t, targetType)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {hops > 0 ? (
          <div className="border-b border-status-pending-border bg-status-pending-muted px-5 py-2 text-xs text-status-pending-foreground">
            <strong>Skipping {hops} hop{hops === 1 ? "" : "s"}.</strong>{" "}
            Fields the source doesn't carry (supplier, currency, bank account, etc.) must be filled on the next form.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1.4fr_1fr]">
          {/* Left: parent lines */}
          <div className="overflow-y-auto border-b border-border lg:border-r lg:border-b-0">
            {parents.map((parent) => {
              const rows = draft
                .map((d, idx) => ({ d, idx }))
                .filter((x) => x.d.parentDocId === parent.docId);
              return (
                <section key={parent.docId} className="border-b border-border last:border-b-0">
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-muted/50 px-4 py-2 text-xs">
                    <span className="font-mono text-foreground">{parent.docNumber}</span>
                    <span className="text-muted-foreground">{parent.docType.toUpperCase()}</span>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs text-muted-foreground">
                      <tr>
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Adopt qty</th>
                        <th className="px-3 py-2 text-right">/ max</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map(({ d, idx }) => {
                        const disabled = d.maxQty === 0;
                        return (
                          <tr key={d.lineId} className={disabled ? "opacity-50" : ""}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={d.selected && !disabled}
                                disabled={disabled}
                                onChange={(e) =>
                                  update(idx, { selected: e.target.checked })
                                }
                                aria-label={`Adopt ${d.description}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-sm text-foreground">{d.description}</div>
                              {disabled ? (
                                <div className="text-xs text-muted-foreground">{t("fullyConsumed")}</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <input
                                type="number"
                                min={0}
                                max={d.maxQty}
                                step="any"
                                value={d.qty}
                                disabled={disabled || !d.selected}
                                onChange={(e) => {
                                  const v = Math.max(
                                    0,
                                    Math.min(d.maxQty, Number(e.target.value) || 0),
                                  );
                                  update(idx, { qty: v });
                                }}
                                className="w-24 rounded-md border border-input px-2 py-1 text-right text-sm"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                              / {d.maxQty}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>

          {/* Right: live preview of merged target lines */}
          <aside className="overflow-y-auto bg-muted/50">
            <div className="sticky top-0 z-10 border-b border-border bg-muted/50 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("previewHeading")}
            </div>
            <div className="p-4">
              {preview.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t("noSelection")}</div>
              ) : (
                <ul className="space-y-2">
                  {preview.map((p) => (
                    <li
                      key={p.productId + p.unitPrice}
                      className="rounded-md border border-border bg-card p-3 text-sm"
                    >
                      <div className="text-foreground">{p.description}</div>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>
                          qty <span className="tabular-nums text-foreground">{p.qty}</span> ×{" "}
                          <span className="tabular-nums text-foreground">
                            {p.unitPrice.toFixed(3)}
                          </span>
                        </span>
                        <span className="tabular-nums text-foreground">
                          {(p.qty * p.unitPrice).toFixed(3)} {currency}
                        </span>
                      </div>
                      {p.sources.length > 1 ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("mergedFrom", { count: p.sources.length })}: {p.sources.join(", ")}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        <footer className="flex items-center justify-between border-t border-border bg-card px-5 py-3">
          <div className="text-sm text-muted-foreground">
            {selected.length} line{selected.length === 1 ? "" : "s"} ·{" "}
            <span className="font-medium tabular-nums text-foreground">
              {subtotal.toFixed(3)} {currency}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={continueToForm}
              className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-50"
              disabled={selected.length === 0}
            >
              {t("continue")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function buildDraft(parents: AdoptionParent[]): DraftLine[] {
  return parents.flatMap((p) =>
    p.lines.map<DraftLine>((l) => ({
      ...l,
      parentDocType: p.docType,
      parentDocId: p.docId,
      parentDocNumber: p.docNumber,
    })),
  );
}

type PreviewLine = {
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  sources: string[];
};

function mergePreview(lines: DraftLine[]): PreviewLine[] {
  const map = new Map<string, PreviewLine>();
  for (const l of lines) {
    const key = `${l.productId}__${l.unitPrice}`;
    const prev = map.get(key);
    if (prev) {
      prev.qty += l.qty;
      if (!prev.sources.includes(l.parentDocNumber)) prev.sources.push(l.parentDocNumber);
    } else {
      map.set(key, {
        productId: l.productId,
        description: l.description,
        qty: l.qty,
        unitPrice: l.unitPrice,
        sources: [l.parentDocNumber],
      });
    }
  }
  return Array.from(map.values());
}

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

function translateTarget(t: Translator, type: DocType): string {
  try {
    return t(`target.${type}`);
  } catch {
    return labelFor(type);
  }
}

function labelFor(t: DocType): string {
  switch (t) {
    case "pr": return "Purchase Requisition";
    case "rfq": return "RFQ";
    case "po": return "Purchase Order";
    case "grn": return "Goods Receipt";
    case "vendor_bill": return "Vendor Bill";
    case "vendor_payment": return "Vendor Payment";
    case "vendor_return": return "Vendor Return";
    case "debit_note": return "Debit Note";
    case "quote": return "Quote";
    case "so": return "Sales Order";
    case "dn": return "Delivery Note";
    case "customer_invoice": return "Customer Invoice";
    case "customer_receipt": return "Customer Receipt";
    case "customer_return": return "Customer Return";
    case "credit_note": return "Credit Note";
    default: return t;
  }
}
