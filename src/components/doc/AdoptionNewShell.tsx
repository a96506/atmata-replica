"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import {
  clearAdoptionContext,
  readAdoptionContext,
} from "@/lib/api/adoption";
import { createRfqAction, createVendorReturnAction } from "@/lib/actions/p2p";
import { createCustomerReturnAction } from "@/lib/actions/q2c";
import type { AdoptionContext, DocType } from "@/types";

/**
 * AdoptionNewShell — /new form that consumes AdoptionContext from browser scratch
 * (stashed by AdoptionPicker) and persists via domain create RPCs.
 */

export type AdoptionNewShellProps = {
  locale: string;
  targetType: DocType;
  title: string;
  /** Where to go after save (typically the list page). */
  backHref: string;
  /** Optional intro/banner above the lines. */
  banner?: React.ReactNode;
};

export function AdoptionNewShell({
  locale,
  targetType,
  title,
  backHref,
  banner,
}: AdoptionNewShellProps) {
  const router = useRouter();
  const writeLocale = locale === "ar" ? "ar" : "en";
  const idempotencyKeyRef = React.useRef(crypto.randomUUID());
  const [ctx, setCtx] = React.useState<AdoptionContext | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setCtx(readAdoptionContext(targetType));
    setHydrated(true);
  }, [targetType]);

  if (!hydrated) {
    return (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="rounded-md border border-dashed border-input bg-card p-6">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">
          No adoption context found in this session. Open a parent document and
          use the
          <span className="mx-1 font-medium text-primary">Adopt to →</span>
          menu to start an adoption.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="cursor-pointer rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const allLines = ctx.parents.flatMap((p) =>
    p.lines
      .filter((l) => l.selected && l.qty > 0)
      .map((l) => ({ ...l, parentNumber: p.docNumber, parentType: p.docType, parentId: p.docId })),
  );
  const subtotal = allLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const onSave = async () => {
    if (pending) return;
    if (allLines.length === 0) {
      toast.error("Select at least one line to adopt.");
      return;
    }

    setPending(true);
    try {
      const result = await persistAdoption({
        targetType,
        locale: writeLocale,
        idempotencyKey: idempotencyKeyRef.current,
        ctx,
        allLines,
      });

      if (!result.ok) {
        toast.error(result.error.messageKey ?? result.error.code);
        return;
      }

      idempotencyKeyRef.current = crypto.randomUUID();
      clearAdoptionContext(targetType);
      toast.success(`${title} created · ${result.data.number}`);
      router.push(
        result.data.id
          ? `${backHref.replace(/\/$/, "")}/${result.data.id}`
          : backHref,
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const onCancel = () => {
    clearAdoptionContext(targetType);
    router.push(backHref);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          New {targetType}
        </div>
        <h1 className="mt-0.5 text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adopted from{" "}
          {ctx.parents.map((p, i) => (
            <span key={p.docId}>
              {i > 0 ? ", " : null}
              <a
                href={hrefForParent(p.docType, p.docId, locale)}
                className="text-primary hover:underline"
              >
                {p.docNumber}
              </a>
            </span>
          ))}
          .
        </p>
        {banner ? <div className="mt-3">{banner}</div> : null}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Lines adopted
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">From</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allLines.map((l, i) => (
              <tr key={l.lineId}>
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3">{l.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.qty}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {l.unitPrice.toFixed(3)}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {(l.qty * l.unitPrice).toFixed(3)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {l.parentNumber}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/50 text-sm">
            <tr>
              <td
                colSpan={4}
                className="px-4 py-2 text-right font-medium text-foreground"
              >
                Subtotal
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">
                {subtotal.toFixed(3)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="cursor-pointer rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

type AdoptedLine = {
  lineId: string;
  productId: string;
  description: string;
  unitPrice: number;
  taxCodeId: string | null;
  qty: number;
  parentType: DocType;
  parentId: string;
  parentNumber: string;
};

async function persistAdoption(args: {
  targetType: DocType;
  locale: "en" | "ar";
  idempotencyKey: string;
  ctx: AdoptionContext;
  allLines: AdoptedLine[];
}) {
  const { targetType, locale, idempotencyKey, ctx, allLines } = args;
  const source = {
    parents: ctx.parents.map((p) => ({
      docType: p.docType,
      docId: p.docId,
    })),
  };

  if (targetType === "rfq") {
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    return createRfqAction({
      locale,
      idempotencyKey,
      intent: "save_draft",
      header: {
        expectedQuoteBy: expected.toISOString().slice(0, 10),
        invitedSupplierIds: [],
        notes: undefined,
      },
      lines: allLines.map((l) => ({
        productId: l.productId,
        description: l.description,
        qty: l.qty,
        unitPrice: l.unitPrice,
        taxCodeId: l.taxCodeId ?? undefined,
        sourceLineId: l.lineId,
      })),
      source,
    });
  }

  if (targetType === "vendor_return") {
    const grnParent = ctx.parents.find((p) => p.docType === "grn");
    if (!grnParent) {
      return {
        ok: false as const,
        error: {
          code: "VALIDATION" as const,
          messageKey: "errors.validation",
          retryable: false,
          requestId: crypto.randomUUID(),
        },
      };
    }
    return createVendorReturnAction({
      locale,
      idempotencyKey,
      intent: "save_draft",
      header: { grnId: grnParent.docId },
      lines: allLines.map((l) => ({
        grnLineId: l.lineId,
        qty: l.qty,
        reasonCode: "damaged" as const,
      })),
      source,
    });
  }

  if (targetType === "customer_return") {
    const dnParent = ctx.parents.find((p) => p.docType === "dn");
    if (!dnParent) {
      return {
        ok: false as const,
        error: {
          code: "VALIDATION" as const,
          messageKey: "errors.validation",
          retryable: false,
          requestId: crypto.randomUUID(),
        },
      };
    }
    return createCustomerReturnAction({
      locale,
      idempotencyKey,
      intent: "save_draft",
      header: { dnId: dnParent.docId },
      lines: allLines.map((l) => ({
        dnLineId: l.lineId,
        qty: l.qty,
        reasonCode: "damaged" as const,
      })),
      source,
    });
  }

  return {
    ok: false as const,
    error: {
      code: "VALIDATION" as const,
      messageKey: "errors.validation",
      retryable: false,
      requestId: crypto.randomUUID(),
    },
  };
}

function hrefForParent(t: DocType, id: string, locale: string): string {
  switch (t) {
    case "pr":
      return `/${locale}/purchasing/purchase-requisitions/${id}`;
    case "rfq":
      return `/${locale}/purchasing/rfqs/${id}`;
    case "po":
      return `/${locale}/purchasing/purchase-orders/${id}`;
    case "grn":
      return `/${locale}/purchasing/goods-receipts/${id}`;
    case "vendor_bill":
      return `/${locale}/purchasing/bills/${id}`;
    case "vendor_return":
      return `/${locale}/purchasing/vendor-returns/${id}`;
    case "quote":
      return `/${locale}/sales/quotes/${id}`;
    case "so":
      return `/${locale}/sales/orders/${id}`;
    case "dn":
      return `/${locale}/sales/deliveries/${id}`;
    case "customer_invoice":
      return `/${locale}/sales/invoices/${id}`;
    case "customer_return":
      return `/${locale}/sales/returns/${id}`;
    default:
      return `/${locale}`;
  }
}
