export type InboxItem = {
  id: number;
  source: string;
  title: string;
  ai_reasoning?: string | null;
  confidence?: number | null;
  suggested_action?: string | null;
  severity?: string | null;
  created_at: string;
  source_url?: string | null;
};

export const DEMO_INBOX: {
  items: InboxItem[];
  by_source: Record<string, number>;
} = {
  items: [
    {
      id: 101,
      source: "audit_log",
      title: "Vendor bill BILL-2026-00002 — 3-way match discrepancy",
      ai_reasoning: "Billed 520 cartons but only 500 received against PO-2026-00002.",
      confidence: 0.91,
      severity: "medium",
      created_at: new Date().toISOString(),
      source_url: "/purchasing/bills/bill_2",
    },
    {
      id: 55,
      source: "document_processing",
      title: "Vendor bill BILL-2026-00001 — posted & paid",
      ai_reasoning: "3-way match clean; payment VPAY-2026-00001 settled in full.",
      confidence: 0.97,
      severity: "low",
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      source_url: "/purchasing/bills/bill_1",
    },
    {
      id: 12,
      source: "reconciliation",
      title: "Bank session #12 — 3 medium-confidence matches",
      ai_reasoning: null,
      confidence: 0.72,
      severity: "high",
      created_at: new Date(Date.now() - 7200_000).toISOString(),
      source_url: null,
    },
    {
      id: 77,
      source: "credit_hold",
      title: "SO-2026-00002 blocked — Project Alpha JV over limit",
      ai_reasoning: "Customer exposure 62,500 exceeds credit limit 60,000. SO confirm blocked.",
      confidence: 1,
      severity: "high",
      created_at: new Date(Date.now() - 10800_000).toISOString(),
      source_url: "/sales/orders/so_2",
    },
  ],
  by_source: { audit_log: 1, document_processing: 1, reconciliation: 1, credit_hold: 1 },
};
