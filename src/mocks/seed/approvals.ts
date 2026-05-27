import type { DocType } from "@/types";

/**
 * Approval routing rules. The lowest matching threshold approver runs first;
 * additional thresholds escalate. Amounts in company base currency (KWD).
 */
export type ApprovalRule = {
  id: string;
  docType: DocType;
  minAmount: number;
  approverName: string;
  approverRole: string;
};

export const APPROVAL_RULES: ApprovalRule[] = [
  { id: "ar_po_1", docType: "po", minAmount: 0, approverName: "Khalid Al-Mutawa", approverRole: "approver" },
  { id: "ar_po_2", docType: "po", minAmount: 5_000, approverName: "Ahmed Al-Rashed", approverRole: "approver" },
  { id: "ar_po_3", docType: "po", minAmount: 50_000, approverName: "CFO", approverRole: "admin" },

  { id: "ar_bill_1", docType: "vendor_bill", minAmount: 0, approverName: "Sarah (AP supervisor)", approverRole: "approver" },
  { id: "ar_bill_2", docType: "vendor_bill", minAmount: 10_000, approverName: "Ahmed Al-Rashed", approverRole: "approver" },

  { id: "ar_vpay_1", docType: "vendor_payment", minAmount: 0, approverName: "CFO", approverRole: "admin" },

  { id: "ar_so_1", docType: "so", minAmount: 0, approverName: "Sales manager", approverRole: "approver" },
  { id: "ar_so_2", docType: "so", minAmount: 20_000, approverName: "Commercial director", approverRole: "approver" },

  { id: "ar_inv_1", docType: "customer_invoice", minAmount: 0, approverName: "AR supervisor", approverRole: "approver" },

  { id: "ar_adj_1", docType: "stock_adjustment", minAmount: 0, approverName: "Warehouse manager", approverRole: "approver" },
  { id: "ar_adj_2", docType: "stock_adjustment", minAmount: 5_000, approverName: "CFO", approverRole: "admin" },

  { id: "ar_je_1", docType: "journal_entry", minAmount: 0, approverName: "Accountant", approverRole: "accountant" },
  { id: "ar_je_2", docType: "journal_entry", minAmount: 50_000, approverName: "CFO", approverRole: "admin" },
];

/** Resolve the approval chain for a given (docType, amount). */
export function resolveApprovalChain(
  docType: DocType,
  amount: number,
): ApprovalRule[] {
  return APPROVAL_RULES.filter(
    (r) => r.docType === docType && amount >= r.minAmount,
  ).sort((a, b) => a.minAmount - b.minAmount);
}
