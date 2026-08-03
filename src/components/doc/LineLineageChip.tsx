"use client";

import type { DocLine } from "@/types";

/**
 * LineLineageChip — small inline indicator on DocLines rows showing how
 * much of a line has flowed downstream (received/delivered/invoiced).
 *
 * Renders as a `n / max` mini-bar; turns green when fully consumed.
 */

export type LineLineageChipProps = {
  /** Total ordered on this line. */
  ordered: number;
  /** What's already flowed downstream (qtyReceived, qtyDelivered, qtyInvoiced …). */
  flowed: number;
  /** What kind of flow (used for the hover tooltip text). */
  label?: string;
};

export function LineLineageChip({ ordered, flowed, label = "received" }: LineLineageChipProps) {
  const pct = ordered > 0 ? Math.min(100, (flowed / ordered) * 100) : 0;
  const tone =
    pct >= 100
      ? "bg-status-success"
      : pct > 0
        ? "bg-status-pending"
        : "bg-muted";

  return (
    <span
      className="inline-flex items-center gap-2 align-middle text-xs text-muted-foreground"
      title={`${flowed} of ${ordered} ${label}`}
    >
      <span className="relative inline-block h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className={`absolute inset-y-0 left-0 ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums whitespace-nowrap">
        {flowed} / {ordered}
      </span>
    </span>
  );
}

/** Convenience reader: pulls the appropriate flowed-qty field from a DocLine. */
export function flowedFor(line: DocLine, kind: "received" | "delivered" | "invoiced"): number {
  if (kind === "received") return line.qtyReceived ?? 0;
  if (kind === "delivered") return line.qtyDelivered ?? 0;
  return line.qtyInvoiced ?? 0;
}
