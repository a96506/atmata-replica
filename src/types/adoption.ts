/**
 * Atmata — Document Adoption types.
 *
 * "Adoption" = converting (some) lines from one or more parent documents into
 * a new child document (e.g. PR → RFQ, PO → GRN, GRN → Bill, multiple PRs → 1 PO).
 *
 * The shape is intentionally generic so a single AdoptionPicker UI can drive
 * every adoption flow in the system.
 */

import type { DocType, Money, ISO8601 } from "./common";

/** One line of a parent doc, as offered to the AdoptionPicker. */
export type AdoptionParentLine = {
  /** Stable id of the parent line — uses parent's own line id. */
  lineId: string;
  /** Convenience for display. */
  productId: string;
  description: string;
  /** Unit price on parent (used to seed target line). */
  unitPrice: number;
  /** Tax code on parent. */
  taxCodeId: string | null;
  /** Whether the user has ticked this line for adoption. */
  selected: boolean;
  /** Qty the user wants to adopt; clamped to [0, maxQty]. */
  qty: number;
  /** Max adoptable qty (parent qty minus already-adopted-elsewhere). */
  maxQty: number;
  /** Optional per-line note carried over to the child. */
  note?: string;
};

export type AdoptionParent = {
  docType: DocType;
  docId: string;
  docNumber: string;
  lines: AdoptionParentLine[];
};

/**
 * Stashed in sessionStorage under key `atmata.adopting.<targetType>` and read
 * by every /new form. The form pre-fills lines from this context.
 */
export type AdoptionContext = {
  targetType: DocType;
  parents: AdoptionParent[];
  /** Created at — for cleanup of stale contexts. */
  createdAt: ISO8601;
};

/**
 * A single adoption edge (one parent line → one child line).
 * Many edges may be produced by one adoption when lines merge across parents.
 */
export type AdoptionEdge = {
  from: { docType: DocType; docId: string; lineId?: string };
  to: { docType: DocType; docId: string; lineId?: string };
  qty?: number;
  value?: Money;
  createdAt: ISO8601;
  /** Optional human note for audit trail. */
  reason?: string;
};

/** Node in an ancestry/descendant tree returned by getAncestry / getDescendants. */
export type AdoptionTreeNode = {
  docType: DocType;
  docId: string;
  docNumber: string;
  state: string;
  /** Roll-up total for the doc, if known. */
  totalValue?: Money;
  /** Children in this direction (downstream for descendants, upstream for ancestry). */
  children: AdoptionTreeNode[];
};
