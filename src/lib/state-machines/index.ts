import type { DocState, DocType, Role } from "@/types";

export type Action = {
  id: string;
  label: string;
  toState: DocState;
  roles: Role[];
  destructive?: boolean;
};

type Transitions = Partial<Record<DocState, Action[]>>;

const DEFAULT: Transitions = {
  draft: [
    {
      id: "submit",
      label: "common.actions.submit",
      toState: "pending",
      roles: [],
    },
    {
      id: "cancel",
      label: "common.actions.cancel",
      toState: "cancelled",
      roles: [],
      destructive: true,
    },
  ],
  pending: [
    {
      id: "approve",
      label: "common.actions.approve",
      toState: "confirmed",
      roles: ["approver", "admin"],
    },
    {
      id: "reject",
      label: "common.actions.reject",
      toState: "draft",
      roles: ["approver", "admin"],
    },
    {
      id: "recall",
      label: "common.actions.recall",
      toState: "draft",
      roles: [],
    },
  ],
  confirmed: [
    {
      id: "post",
      label: "common.actions.post",
      toState: "posted",
      roles: [],
    },
    {
      id: "cancel",
      label: "common.actions.cancel",
      toState: "cancelled",
      roles: ["approver", "admin"],
      destructive: true,
    },
  ],
  posted: [
    {
      id: "reverse",
      label: "common.actions.reverse",
      toState: "cancelled",
      roles: ["accountant", "admin"],
      destructive: true,
    },
  ],
};

const PO: Transitions = {
  ...DEFAULT,
  draft: [
    { id: "submit", label: "common.actions.submit", toState: "pending", roles: ["buyer", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["buyer", "admin"], destructive: true },
  ],
};

const VENDOR_BILL: Transitions = {
  ...DEFAULT,
  draft: [
    { id: "submit", label: "common.actions.submit", toState: "pending", roles: ["ap_clerk", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["ap_clerk", "admin"], destructive: true },
  ],
};

const CUSTOMER_INVOICE: Transitions = {
  ...DEFAULT,
  draft: [
    { id: "submit", label: "common.actions.submit", toState: "pending", roles: ["ar_clerk", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["ar_clerk", "admin"], destructive: true },
  ],
};

const RFQ: Transitions = {
  draft: [
    { id: "send", label: "common.actions.send", toState: "sent", roles: ["buyer", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["buyer", "admin"], destructive: true },
  ],
  sent: [
    { id: "record_quotes", label: "rfq.actions.record_quotes", toState: "quotes_received", roles: ["buyer", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["buyer", "admin"], destructive: true },
  ],
  quotes_received: [
    { id: "award", label: "rfq.actions.award", toState: "awarded", roles: ["buyer", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["buyer", "admin"], destructive: true },
  ],
  awarded: [
    { id: "close", label: "common.actions.close", toState: "closed", roles: ["buyer", "admin"] },
  ],
};

const RETURN_DOC: Transitions = {
  draft: [
    { id: "submit", label: "common.actions.submit", toState: "pending", roles: ["warehouse", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["warehouse", "admin"], destructive: true },
  ],
  pending: [
    { id: "approve", label: "common.actions.approve", toState: "confirmed", roles: ["approver", "admin"] },
    { id: "reject", label: "common.actions.reject", toState: "draft", roles: ["approver", "admin"] },
    { id: "recall", label: "common.actions.recall", toState: "draft", roles: [] },
  ],
  confirmed: [
    { id: "post", label: "common.actions.post", toState: "posted", roles: ["warehouse", "accountant", "admin"] },
    { id: "cancel", label: "common.actions.cancel", toState: "cancelled", roles: ["approver", "admin"], destructive: true },
  ],
  posted: [
    { id: "reverse", label: "common.actions.reverse", toState: "cancelled", roles: ["accountant", "admin"], destructive: true },
  ],
};

const TRANSITIONS: Partial<Record<DocType, Transitions>> = {
  po: PO,
  vendor_bill: VENDOR_BILL,
  customer_invoice: CUSTOMER_INVOICE,
  rfq: RFQ,
  vendor_return: RETURN_DOC,
  customer_return: RETURN_DOC,
};

export function legalActions(
  docType: DocType,
  state: DocState,
  role: Role,
): Action[] {
  const t = TRANSITIONS[docType] ?? DEFAULT;
  const actions = t[state] ?? [];
  return actions.filter(
    (a) => a.roles.length === 0 || a.roles.includes(role) || role === "admin",
  );
}

export const TERMINAL_STATES: DocState[] = ["posted", "locked", "archived", "cancelled"];

export function isEditable(state: DocState): boolean {
  return state === "draft";
}

export function isPosted(state: DocState): boolean {
  return state === "posted" || state === "locked" || state === "archived";
}

/* ------------------------------------------------------------------ *
 *  Adoption — which child documents can a given parent be adopted into?
 * ------------------------------------------------------------------ */

export type AdoptionTarget = {
  targetType: DocType;
  /** i18n key, e.g. "adoption.target.po". */
  label: string;
  /** 0 = direct child, 1+ = number of intermediate hops skipped. */
  hops?: number;
  /** Doc types skipped between the source and this target (informational). */
  via?: DocType[];
};

/** Reverse-flow children that should NEVER be reached transitively. */
const REVERSE_FLOW: DocType[] = [
  "vendor_return",
  "debit_note",
  "customer_return",
  "credit_note",
];

/** State → list of legal adoption targets. Same shape as Transitions. */
type AdoptionMap = Partial<Record<DocState, AdoptionTarget[]>>;

const ADOPTIONS: Partial<Record<DocType, AdoptionMap>> = {
  pr: {
    confirmed: [
      { targetType: "rfq", label: "adoption.target.rfq" },
      { targetType: "po", label: "adoption.target.po" },
    ],
    posted: [
      { targetType: "rfq", label: "adoption.target.rfq" },
      { targetType: "po", label: "adoption.target.po" },
    ],
  },
  rfq: {
    awarded: [{ targetType: "po", label: "adoption.target.po" }],
    closed: [{ targetType: "po", label: "adoption.target.po" }],
  },
  po: {
    confirmed: [
      { targetType: "grn", label: "adoption.target.grn" },
      { targetType: "vendor_bill", label: "adoption.target.vendor_bill" },
    ],
    posted: [
      { targetType: "grn", label: "adoption.target.grn" },
      { targetType: "vendor_bill", label: "adoption.target.vendor_bill" },
    ],
  },
  grn: {
    posted: [
      { targetType: "vendor_bill", label: "adoption.target.vendor_bill" },
      { targetType: "vendor_return", label: "adoption.target.vendor_return" },
    ],
  },
  vendor_bill: {
    posted: [{ targetType: "vendor_payment", label: "adoption.target.vendor_payment" }],
  },
  vendor_return: {
    posted: [{ targetType: "debit_note", label: "adoption.target.debit_note" }],
  },
  quote: {
    confirmed: [{ targetType: "so", label: "adoption.target.so" }],
    posted: [{ targetType: "so", label: "adoption.target.so" }],
    // Quote has extra states "accepted" / "expired" not in DocState — cast through.
    ["accepted" as DocState]: [{ targetType: "so", label: "adoption.target.so" }],
  },
  so: {
    confirmed: [
      { targetType: "dn", label: "adoption.target.dn" },
      { targetType: "customer_invoice", label: "adoption.target.customer_invoice" },
    ],
    posted: [
      { targetType: "dn", label: "adoption.target.dn" },
      { targetType: "customer_invoice", label: "adoption.target.customer_invoice" },
    ],
  },
  dn: {
    posted: [
      { targetType: "customer_invoice", label: "adoption.target.customer_invoice" },
      { targetType: "customer_return", label: "adoption.target.customer_return" },
    ],
  },
  customer_invoice: {
    posted: [{ targetType: "customer_receipt", label: "adoption.target.customer_receipt" }],
  },
  customer_return: {
    posted: [{ targetType: "credit_note", label: "adoption.target.credit_note" }],
  },
};

/**
 * Forward-edge children of a doc-type, **ignoring** the current state.
 * Used by the transitive-closure walker. Reverse-flow children are kept
 * so they remain reachable as DIRECT (hops=0) targets but the walker
 * never recurses into them.
 */
function forwardChildrenAnyState(docType: DocType): AdoptionTarget[] {
  const m = ADOPTIONS[docType];
  if (!m) return [];
  const seen = new Set<DocType>();
  const out: AdoptionTarget[] = [];
  for (const targets of Object.values(m)) {
    for (const t of targets ?? []) {
      if (seen.has(t.targetType)) continue;
      seen.add(t.targetType);
      out.push(t);
    }
  }
  return out;
}

/**
 * Compute every descendant of `docType` reachable through forward edges,
 * tagged with hop distance. Reverse-flow edges (Returns / Notes) are NOT
 * traversed — they only remain as direct (hops=0) children when the
 * source's current state allows it.
 */
function descendantAdoptions(docType: DocType): AdoptionTarget[] {
  const visited = new Map<DocType, AdoptionTarget>();
  const queue: Array<{ type: DocType; hops: number; via: DocType[] }> = [
    { type: docType, hops: 0, via: [] },
  ];
  while (queue.length) {
    const node = queue.shift()!;
    for (const child of forwardChildrenAnyState(node.type)) {
      // Only count hops via forward chain, so don't recurse into reverse-flow.
      const isReverse = REVERSE_FLOW.includes(child.targetType);
      const childHops = node.hops; // hops counts intermediates *skipped*, not edges
      const existing = visited.get(child.targetType);
      if (!existing || childHops < (existing.hops ?? 0)) {
        visited.set(child.targetType, {
          targetType: child.targetType,
          label: child.label,
          hops: childHops,
          via: node.via,
        });
      }
      if (!isReverse) {
        queue.push({
          type: child.targetType,
          hops: node.hops + 1,
          via: [...node.via, child.targetType],
        });
      }
    }
  }
  return Array.from(visited.values());
}

export function legalAdoptions(
  docType: DocType,
  state: DocState,
  _role: Role,
): AdoptionTarget[] {
  // Direct children gated by current state.
  const m = ADOPTIONS[docType];
  const direct = m?.[state] ?? [];
  const directSet = new Set(direct.map((t) => t.targetType));

  // If no direct children at this state, the doc isn't in an adoptable state.
  if (direct.length === 0) return [];

  // Transitively reachable descendants (state-agnostic; the user accepts that
  // multi-hop adoption requires filling in fields the source doc doesn't carry).
  const descendants = descendantAdoptions(docType)
    .filter((d) => !directSet.has(d.targetType))
    .filter((d) => !REVERSE_FLOW.includes(d.targetType));

  return [
    ...direct.map((t) => ({ ...t, hops: 0, via: [] as DocType[] })),
    ...descendants,
  ];
}
