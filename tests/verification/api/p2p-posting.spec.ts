import { expect, test } from "@playwright/test";
import {
  loadLocalEnv,
  mutationAllowed,
  tenantAOwner,
  verifyRunId,
} from "../fixtures/accounts";
import { loadVerifyAWriteContext, sdkFor } from "../fixtures/erp-fixture";

loadLocalEnv();

/**
 * Curated P2P smoke (not full posting): PR → PO → GRN drafts on VERIFY Tenant A.
 * Full bill/post matrix stays manual / verify.md §14 until inventory edge cases settle.
 */
test("PO → GRN curated create chain", async () => {
  test.skip(!mutationAllowed(), "mutation mode required");
  const owner = tenantAOwner();
  const runId = verifyRunId();
  test.skip(!owner || !runId, "VERIFY_A_OWNER_* and VERIFY_RUN_ID required");

  const client = await sdkFor(owner!.email, owner!.password);
  const ctx = await loadVerifyAWriteContext(client);
  test.skip(
    !ctx,
    "VERIFY Tenant A missing seeded product VF-RM-01 — run npm run seed:verify-master-data",
  );

  const supplier = await client.database
    .from("suppliers")
    .select("id,payment_term_id")
    .eq("name", "VF Verify Supplier")
    .limit(1);
  const warehouse = await client.database.from("warehouses").select("id").limit(1);
  const suppliers = Array.isArray(supplier.data) ? supplier.data : [];
  const warehouses = Array.isArray(warehouse.data) ? warehouse.data : [];
  const sup = suppliers[0] as
    | { id?: string; payment_term_id?: string }
    | undefined;
  const wh = warehouses[0] as { id?: string } | undefined;
  test.skip(
    !sup?.id || !sup.payment_term_id || !wh?.id,
    "VERIFY Tenant A missing seeded supplier/warehouse",
  );

  const today = new Date().toISOString().slice(0, 10);
  const expected = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const pr = await client.database.rpc("create_purchase_requisition", {
    p_idempotency_key: `verify-p2p-pr-${runId}`,
    p_intent: "save_draft",
    p_header: { neededBy: ctx!.neededBy, notes: `p2p pr ${runId}` },
    p_lines: [
      {
        productId: ctx!.productId,
        description: "P2P PR line",
        qty: 1,
        unitPrice: 10,
        ...(ctx!.taxCodeId ? { taxCodeId: ctx!.taxCodeId } : {}),
      },
    ],
    p_source: null,
  });
  expect(pr.error, String(pr.error)).toBeFalsy();
  const prId =
    (pr.data as { id?: string } | null)?.id ??
    (pr.data as { documentId?: string } | null)?.documentId;
  expect(prId).toBeTruthy();

  const po = await client.database.rpc("create_purchase_order", {
    p_idempotency_key: `verify-p2p-po-${runId}`,
    p_intent: "save_draft",
    p_header: {
      supplierId: sup!.id,
      currency: "KWD",
      paymentTermId: sup!.payment_term_id,
      warehouseId: wh!.id,
      date: today,
      expectedDate: expected,
      notes: `p2p po ${runId}`,
      prId,
    },
    p_lines: [
      {
        productId: ctx!.productId,
        description: "P2P PO line",
        qty: 1,
        unitPrice: 10,
        ...(ctx!.taxCodeId ? { taxCodeId: ctx!.taxCodeId } : {}),
      },
    ],
    p_source: null,
  });
  expect(po.error, String(po.error)).toBeFalsy();
  const poId =
    (po.data as { id?: string } | null)?.id ??
    (po.data as { documentId?: string } | null)?.documentId;
  expect(poId).toBeTruthy();

  const poLines = await client.database
    .from("purchase_order_lines")
    .select("id")
    .eq("purchase_order_id", poId!)
    .limit(1);
  const lineRows = Array.isArray(poLines.data) ? poLines.data : [];
  const poLineId = (lineRows[0] as { id?: string } | undefined)?.id;
  expect(poLineId).toBeTruthy();

  const grn = await client.database.rpc("create_goods_receipt", {
    p_idempotency_key: `verify-p2p-grn-${runId}`,
    p_intent: "save_draft",
    p_header: { poId, warehouseId: wh!.id, notes: `p2p grn ${runId}` },
    p_lines: [{ poLineId, qtyReceived: 1 }],
    p_source: null,
  });
  expect(grn.error, String(grn.error)).toBeFalsy();
  const grnId =
    (grn.data as { id?: string } | null)?.id ??
    (grn.data as { documentId?: string } | null)?.documentId;
  expect(grnId).toBeTruthy();
});
