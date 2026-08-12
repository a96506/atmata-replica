import type { AuditEvent } from "@/types";

/** One audit row per state transition we want the History tab to render. */
export const AUDIT_EVENTS: AuditEvent[] = [
  // PR-2026-00001
  { id: "ae_1", docId: "pr_1", docType: "pr", fromState: null, toState: "draft", by: "Demo User", at: "2026-04-10T08:30:00Z" },
  { id: "ae_2", docId: "pr_1", docType: "pr", fromState: "draft", toState: "pending", by: "Demo User", at: "2026-04-10T09:00:00Z" },
  { id: "ae_3", docId: "pr_1", docType: "pr", fromState: "pending", toState: "confirmed", by: "Khalid (warehouse mgr)", at: "2026-04-10T11:20:00Z", reason: "Approved." },
  { id: "ae_4", docId: "pr_1", docType: "pr", fromState: "confirmed", toState: "posted", by: "Demo User", at: "2026-04-12T07:00:00Z", reason: "PO-2026-00001 raised." },

  // PO-2026-00001 (full path)
  { id: "ae_10", docId: "po_1", docType: "po", fromState: null, toState: "draft", by: "Demo User", at: "2026-04-12T08:00:00Z" },
  { id: "ae_11", docId: "po_1", docType: "po", fromState: "draft", toState: "pending", by: "Demo User", at: "2026-04-12T08:20:00Z" },
  { id: "ae_12", docId: "po_1", docType: "po", fromState: "pending", toState: "confirmed", by: "Approver", at: "2026-04-12T10:10:00Z" },
  { id: "ae_13", docId: "po_1", docType: "po", fromState: "confirmed", toState: "posted", by: "Demo User", at: "2026-04-19T16:00:00Z", reason: "Closed (fully received + invoiced + paid)." },

  // PO-2026-00002 (3-way exception)
  { id: "ae_14", docId: "po_2", docType: "po", fromState: null, toState: "draft", by: "Demo User", at: "2026-04-14T09:00:00Z" },
  { id: "ae_15", docId: "po_2", docType: "po", fromState: "draft", toState: "confirmed", by: "Approver", at: "2026-04-14T10:00:00Z" },

  // PO-2026-00003 (draft)
  { id: "ae_16", docId: "po_3", docType: "po", fromState: null, toState: "draft", by: "Demo User", at: "2026-04-25T13:00:00Z" },

  // GRN-2026-00001
  { id: "ae_20", docId: "grn_1", docType: "grn", fromState: null, toState: "draft", by: "Warehouse", at: "2026-04-18T07:00:00Z" },
  { id: "ae_21", docId: "grn_1", docType: "grn", fromState: "draft", toState: "posted", by: "Warehouse", at: "2026-04-18T07:30:00Z" },

  // GRN-2026-00002
  { id: "ae_22", docId: "grn_2", docType: "grn", fromState: null, toState: "draft", by: "Warehouse", at: "2026-04-19T09:00:00Z" },
  { id: "ae_23", docId: "grn_2", docType: "grn", fromState: "draft", toState: "posted", by: "Warehouse", at: "2026-04-19T09:30:00Z" },

  // Bill 1 — matched, posted, paid
  { id: "ae_30", docId: "bill_1", docType: "vendor_bill", fromState: null, toState: "draft", by: "AP clerk", at: "2026-04-19T11:00:00Z" },
  { id: "ae_31", docId: "bill_1", docType: "vendor_bill", fromState: "draft", toState: "pending", by: "AP clerk", at: "2026-04-19T11:10:00Z" },
  { id: "ae_32", docId: "bill_1", docType: "vendor_bill", fromState: "pending", toState: "confirmed", by: "Approver", at: "2026-04-19T12:00:00Z", reason: "3-way match OK." },
  { id: "ae_33", docId: "bill_1", docType: "vendor_bill", fromState: "confirmed", toState: "posted", by: "Accountant", at: "2026-04-19T14:30:00Z" },

  // Bill 2 — discrepancy, pending
  { id: "ae_34", docId: "bill_2", docType: "vendor_bill", fromState: null, toState: "draft", by: "AP clerk", at: "2026-04-21T09:00:00Z" },
  { id: "ae_35", docId: "bill_2", docType: "vendor_bill", fromState: "draft", toState: "pending", by: "AP clerk", at: "2026-04-21T09:30:00Z", reason: "Billed 520 vs received 500 — awaiting approver." },

  // Vendor payment
  { id: "ae_40", docId: "vpay_1", docType: "vendor_payment", fromState: null, toState: "draft", by: "AP clerk", at: "2026-05-15T10:00:00Z" },
  { id: "ae_41", docId: "vpay_1", docType: "vendor_payment", fromState: "draft", toState: "posted", by: "Accountant", at: "2026-05-15T10:30:00Z" },

  // Opp + Quote 1
  { id: "ae_50", docId: "opp_1", docType: "opportunity", fromState: null, toState: "confirmed", by: "Sales rep", at: "2026-04-01T10:00:00Z", reason: "Stage: won." },
  { id: "ae_51", docId: "qt_1", docType: "quote", fromState: null, toState: "draft", by: "Sales rep", at: "2026-04-05T08:00:00Z" },
  { id: "ae_52", docId: "qt_1", docType: "quote", fromState: "draft", toState: "posted", by: "Sales rep", at: "2026-04-05T09:00:00Z", reason: "Sent to customer." },
  { id: "ae_53", docId: "qt_1", docType: "quote", fromState: "posted", toState: "confirmed", by: "Customer (via email)", at: "2026-04-07T13:00:00Z", reason: "Accepted." },

  // SO 1
  { id: "ae_60", docId: "so_1", docType: "so", fromState: null, toState: "draft", by: "Sales rep", at: "2026-04-08T08:00:00Z" },
  { id: "ae_61", docId: "so_1", docType: "so", fromState: "draft", toState: "confirmed", by: "Approver", at: "2026-04-08T09:00:00Z" },
  { id: "ae_62", docId: "so_1", docType: "so", fromState: "confirmed", toState: "posted", by: "AR clerk", at: "2026-04-13T14:00:00Z", reason: "Closed (delivered + invoiced + paid)." },

  // SO 2 — blocked
  { id: "ae_63", docId: "so_2", docType: "so", fromState: null, toState: "draft", by: "Sales rep", at: "2026-04-16T11:00:00Z", reason: "Confirm blocked — customer on credit hold." },

  // DN, Invoice, Receipt
  { id: "ae_70", docId: "dn_1", docType: "dn", fromState: null, toState: "draft", by: "Warehouse", at: "2026-04-12T08:30:00Z" },
  { id: "ae_71", docId: "dn_1", docType: "dn", fromState: "draft", toState: "posted", by: "Warehouse", at: "2026-04-12T09:00:00Z" },

  { id: "ae_80", docId: "inv_1", docType: "customer_invoice", fromState: null, toState: "draft", by: "AR clerk", at: "2026-04-13T10:00:00Z" },
  { id: "ae_81", docId: "inv_1", docType: "customer_invoice", fromState: "draft", toState: "posted", by: "AR clerk", at: "2026-04-13T11:00:00Z" },

  { id: "ae_90", docId: "rcp_1", docType: "customer_receipt", fromState: null, toState: "draft", by: "AR clerk", at: "2026-05-02T09:00:00Z" },
  { id: "ae_91", docId: "rcp_1", docType: "customer_receipt", fromState: "draft", toState: "posted", by: "Accountant", at: "2026-05-02T09:15:00Z" },

  // Inventory ops
  { id: "ae_100", docId: "trx_1", docType: "internal_transfer", fromState: null, toState: "posted", by: "Warehouse", at: "2026-04-09T16:00:00Z" },
  { id: "ae_101", docId: "adj_1", docType: "stock_adjustment", fromState: null, toState: "pending", by: "Warehouse", at: "2026-04-20T08:00:00Z", reason: "Damage — flagged for approval." },
  { id: "ae_102", docId: "adj_1", docType: "stock_adjustment", fromState: "pending", toState: "posted", by: "Demo User", at: "2026-04-20T08:30:00Z" },
];
