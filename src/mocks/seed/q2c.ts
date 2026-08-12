import type {
  CustomerInvoice,
  CustomerReceipt,
  DeliveryNote,
  Opportunity,
  Quote,
  SalesOrder,
} from "@/types";

/**
 * Q2C chains seeded for the trail demo. Three stories:
 *   QT-2026-00001 — full happy path (Opp → Quote → SO → DN → Invoice → Receipt)
 *   QT-2026-00002 — draft (no children)
 *   QT-2026-00003 — accepted by customer Project Alpha JV but SO blocked by credit hold
 */

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp_1",
    number: "OPP-2026-00001",
    customerId: "cust_1",
    title: "POS rollout — Phase 2",
    stage: "won",
    value: 22_000,
    probability: 1,
    nextAction: "Hand off to delivery",
    daysIdle: 0,
  },
  {
    id: "opp_2",
    number: "OPP-2026-00002",
    customerId: "cust_4",
    title: "Annual supply — beverages",
    stage: "negotiation",
    value: 55_000,
    probability: 0.7,
    nextAction: "Legal review of terms",
    daysIdle: 18,
  },
];

export const QUOTES: Quote[] = [
  {
    id: "qt_1",
    number: "QT-2026-00001",
    companyId: "co_1",
    customerId: "cust_1",
    opportunityId: "opp_1",
    date: "2026-04-05",
    validUntil: "2026-05-05",
    currency: "KWD",
    state: "accepted",
    lines: [
      {
        id: "qt_1_l1",
        productId: "prod_4",
        description: "Display cooler — 2 door",
        qty: 2,
        unitPrice: 890,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
    subtotal: 1780,
    taxTotal: 89,
    total: 1869,
  },
  {
    id: "qt_2",
    number: "QT-2026-00002",
    companyId: "co_1",
    customerId: "cust_2",
    date: "2026-04-22",
    validUntil: "2026-05-22",
    currency: "KWD",
    state: "draft",
    lines: [
      {
        id: "qt_2_l1",
        productId: "prod_5",
        description: "Barcode scanner kit",
        qty: 5,
        unitPrice: 42.5,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
    subtotal: 212.5,
    taxTotal: 10.625,
    total: 223.125,
  },
  {
    id: "qt_3",
    number: "QT-2026-00003",
    companyId: "co_1",
    customerId: "cust_4",
    opportunityId: "opp_2",
    date: "2026-04-15",
    validUntil: "2026-05-15",
    currency: "KWD",
    state: "accepted",
    lines: [
      {
        id: "qt_3_l1",
        productId: "prod_4",
        description: "Display cooler — 2 door (annual supply, year 1)",
        qty: 10,
        unitPrice: 870,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
    subtotal: 8700,
    taxTotal: 435,
    total: 9135,
  },
  /** Edge case: expired quote — validUntil in the past. */
  {
    id: "qt_4",
    number: "QT-2026-00004",
    companyId: "co_1",
    customerId: "cust_3",
    date: "2026-03-01",
    validUntil: "2026-04-01",
    currency: "KWD",
    state: "expired",
    lines: [
      {
        id: "qt_4_l1",
        productId: "prod_5",
        description: "Barcode scanner kit (expired)",
        qty: 10,
        unitPrice: 42.5,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
    subtotal: 425,
    taxTotal: 21.25,
    total: 446.25,
  },
];

export const SALES_ORDERS: SalesOrder[] = [
  {
    id: "so_1",
    number: "SO-2026-00001",
    companyId: "co_1",
    customerId: "cust_1",
    quoteId: "qt_1",
    date: "2026-04-08",
    expectedDeliveryDate: "2026-04-14",
    currency: "KWD",
    warehouseId: "wh_2",
    state: "posted",
    exceptional: false,
    lines: [
      {
        id: "so_1_l1",
        productId: "prod_4",
        description: "Display cooler — 2 door",
        qty: 2,
        unitPrice: 890,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
    subtotal: 1780,
    taxTotal: 89,
    total: 1869,
  },
  /** Blocked SO — credit hold (cust_4). Sales rep created the draft from the
   *  accepted quote, but the action bar will not let them confirm. */
  {
    id: "so_2",
    number: "SO-2026-00002",
    companyId: "co_1",
    customerId: "cust_4",
    quoteId: "qt_3",
    date: "2026-04-16",
    expectedDeliveryDate: "2026-04-25",
    currency: "KWD",
    warehouseId: "wh_1",
    state: "draft",
    blockedReason: "Customer on credit hold (exposure 62,500 > limit 60,000)",
    exceptional: true,
    lines: [
      {
        id: "so_2_l1",
        productId: "prod_4",
        description: "Display cooler — 2 door (annual supply, year 1)",
        qty: 10,
        unitPrice: 870,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
    subtotal: 8700,
    taxTotal: 435,
    total: 9135,
  },
];

export const DELIVERY_NOTES: DeliveryNote[] = [
  {
    id: "dn_1",
    number: "DEL-2026-00001",
    companyId: "co_1",
    soId: "so_1",
    customerId: "cust_1",
    warehouseId: "wh_2",
    date: "2026-04-12",
    state: "posted",
    lines: [
      {
        id: "dn_1_l1",
        soLineId: "so_1_l1",
        productId: "prod_4",
        description: "Display cooler — 2 door (lot DC-2026-Q2)",
        qty: 2,
        qtyDelivered: 2,
        unitPrice: 890,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
  },
];

export const CUSTOMER_INVOICES: CustomerInvoice[] = [
  {
    id: "inv_1",
    number: "INV-2026-00001",
    companyId: "co_1",
    customerId: "cust_1",
    soId: "so_1",
    dnId: "dn_1",
    date: "2026-04-13",
    dueDate: "2026-05-13",
    currency: "KWD",
    state: "posted",
    lines: [
      {
        id: "inv_1_l1",
        soLineId: "so_1_l1",
        dnLineId: "dn_1_l1",
        productId: "prod_4",
        description: "Display cooler — 2 door",
        qty: 2,
        unitPrice: 890,
        taxCodeId: "tax_kw_vat_5",
      },
    ],
    subtotal: 1780,
    taxTotal: 89,
    total: 1869,
    paid: 1869,
  },
];

export const CUSTOMER_RECEIPTS: CustomerReceipt[] = [
  {
    id: "rcp_1",
    number: "RCP-2026-00001",
    companyId: "co_1",
    customerId: "cust_1",
    bankAccountId: "bank_1",
    date: "2026-05-02",
    currency: "KWD",
    state: "posted",
    amount: 1869,
    allocations: [{ invoiceId: "inv_1", amount: 1869 }],
    method: "wire",
  },
];
