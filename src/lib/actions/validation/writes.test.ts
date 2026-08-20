import { describe, expect, it } from "vitest";

import { validateActionInput } from "../validation";
import { createJournalEntrySchema } from "./gl";
import { createInternalTransferSchema } from "./inventory";
import {
  createPurchaseOrderSchema,
  createRfqSchema,
  createVendorPaymentSchema,
  updateDocumentHeaderSchema,
} from "./p2p";
import { createQuoteSchema, createSalesOrderSchema } from "./q2c";
import {
  acceptReconciliationMatchSchema,
  importBankStatementSchema,
} from "./reconciliation";
import {
  markInboxNotificationReadSchema,
  startPeriodCloseSchema,
} from "./period-close";

const KEY = "11111111-1111-4111-8111-111111111111";

const productLine = {
  productId: "prod_1",
  description: "Widget",
  qty: 2,
  unitPrice: 10,
};

describe("write domain schemas", () => {
  it("accepts a valid purchase order", () => {
    const result = validateActionInput(createPurchaseOrderSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "save_draft",
      header: {
        supplierId: "sup_1",
        currency: "KWD",
        paymentTermId: "pt_1",
        warehouseId: "wh_1",
        date: "2026-08-20",
        expectedDate: "2026-08-25",
      },
      lines: [productLine],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a purchase order missing supplierId", () => {
    const result = validateActionInput(createPurchaseOrderSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "submit",
      header: {
        currency: "KWD",
        paymentTermId: "pt_1",
        warehouseId: "wh_1",
        date: "2026-08-20",
        expectedDate: "2026-08-25",
      },
      lines: [productLine],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
    }
  });

  it("rejects unknown fields on purchase order (strict)", () => {
    const result = validateActionInput(createPurchaseOrderSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "save_draft",
      companyId: "co_evil",
      header: {
        supplierId: "sup_1",
        currency: "KWD",
        paymentTermId: "pt_1",
        warehouseId: "wh_1",
        date: "2026-08-20",
        expectedDate: "2026-08-25",
      },
      lines: [productLine],
    });

    expect(result.ok).toBe(false);
  });

  it("accepts a balanced journal entry", () => {
    const result = validateActionInput(createJournalEntrySchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "save_draft",
      header: { date: "2026-08-20", currency: "KWD" },
      lines: [
        { accountId: "acc_1", debit: 100, credit: 0 },
        { accountId: "acc_2", debit: 0, credit: 100 },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects an unbalanced journal entry", () => {
    const result = validateActionInput(createJournalEntrySchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "post",
      header: { date: "2026-08-20" },
      lines: [
        { accountId: "acc_1", debit: 100, credit: 0 },
        { accountId: "acc_2", debit: 0, credit: 50 },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a journal line with both debit and credit", () => {
    const result = validateActionInput(createJournalEntrySchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "save_draft",
      header: { date: "2026-08-20" },
      lines: [
        { accountId: "acc_1", debit: 50, credit: 50 },
        { accountId: "acc_2", debit: 0, credit: 0 },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("accepts RFQ with empty lines when source parents provided", () => {
    const result = validateActionInput(createRfqSchema, {
      locale: "ar",
      idempotencyKey: KEY,
      intent: "save_draft",
      header: {
        expectedQuoteBy: "2026-09-01",
        invitedSupplierIds: ["sup_1"],
      },
      lines: [],
      source: {
        parents: [{ docType: "pr", docId: "pr_1" }],
      },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects RFQ with neither lines nor parents", () => {
    const result = validateActionInput(createRfqSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "save_draft",
      header: {
        expectedQuoteBy: "2026-09-01",
        invitedSupplierIds: [],
      },
      lines: [],
    });

    expect(result.ok).toBe(false);
  });

  it("accepts vendor payment allocations as lines", () => {
    const result = validateActionInput(createVendorPaymentSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "save_draft",
      header: {
        supplierId: "sup_1",
        bankAccountId: "ba_1",
        date: "2026-08-20",
        currency: "KWD",
        amount: 150,
        method: "wire",
      },
      lines: [
        { billId: "vb_1", amount: 100 },
        { billId: "vb_2", amount: 50 },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("accepts quote and sales order payloads", () => {
    const quote = validateActionInput(createQuoteSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "submit",
      header: {
        customerId: "cus_1",
        currency: "USD",
      },
      lines: [productLine],
    });
    expect(quote.ok).toBe(true);

    const so = validateActionInput(createSalesOrderSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "save_draft",
      header: {
        customerId: "cus_1",
        currency: "USD",
        warehouseId: "wh_1",
        date: "2026-08-20",
        promisedDate: "2026-08-30",
      },
      lines: [productLine],
    });
    expect(so.ok).toBe(true);
  });

  it("accepts internal transfer and header patch schemas", () => {
    const transfer = validateActionInput(createInternalTransferSchema, {
      locale: "en",
      idempotencyKey: KEY,
      intent: "post",
      header: {
        fromWarehouseId: "wh_1",
        toWarehouseId: "wh_2",
      },
      lines: [{ productId: "prod_1", qty: 3 }],
    });
    expect(transfer.ok).toBe(true);

    const patch = validateActionInput(updateDocumentHeaderSchema, {
      locale: "en",
      docType: "po",
      docId: "po_1",
      expectedRowVersion: 2,
      idempotencyKey: KEY,
      patch: { notes: "updated" },
    });
    expect(patch.ok).toBe(true);
  });
});

describe("M17 operational schemas", () => {
  it("accepts accept match + import statement + period close payloads", () => {
    const accept = validateActionInput(acceptReconciliationMatchSchema, {
      locale: "en",
      idempotencyKey: KEY,
      matchId: "match_1",
    });
    expect(accept.ok).toBe(true);

    const importStmt = validateActionInput(importBankStatementSchema, {
      locale: "en",
      idempotencyKey: KEY,
      header: { bankAccountId: "ba_1", number: "STMT-1" },
      lines: [
        {
          lineNumber: 1,
          date: "2026-08-01",
          description: "Deposit",
          amount: 100,
        },
      ],
    });
    expect(importStmt.ok).toBe(true);

    const close = validateActionInput(startPeriodCloseSchema, {
      locale: "en",
      idempotencyKey: KEY,
      fiscalPeriodId: "fp_2026_08",
    });
    expect(close.ok).toBe(true);

    const inbox = validateActionInput(markInboxNotificationReadSchema, {
      locale: "en",
      idempotencyKey: KEY,
      notificationId: "n_1",
    });
    expect(inbox.ok).toBe(true);
  });
});
