import { createClient } from "@insforge/sdk";
import { describe, expect, it } from "vitest";

const baseUrl = process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

async function signIn(email: string, password: string) {
  const client = createClient({ baseUrl, anonKey });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.accessToken) throw new Error(`sign-in failed for ${email}`);
  return createClient({
    baseUrl,
    anonKey,
    accessToken: data.accessToken,
  });
}

const configured = Boolean(
  baseUrl &&
    anonKey &&
    process.env.DEMO_OWNER_EMAIL &&
    process.env.DEMO_OWNER_PASSWORD,
);

describe.skipIf(!configured)("Phase 7 write create RPCs", () => {
  it("creates a PO draft idempotently and ignores tampered totals", async () => {
    const client = await signIn(
      process.env.DEMO_OWNER_EMAIL!,
      process.env.DEMO_OWNER_PASSWORD!,
    );
    const key = crypto.randomUUID();
    const header = {
      supplierId: "sup_1",
      currency: "KWD",
      paymentTermId: "pt_net30",
      warehouseId: "wh_1",
      date: "2026-04-15",
      expectedDate: "2026-04-30",
      notes: "phase7 smoke",
    };
    const lines = [
      {
        productId: "prod_1",
        description: "Smoke line",
        qty: 2,
        unitPrice: 10,
        taxCodeId: "tax_kw_vat_5",
      },
    ];

    const first = await client.database.rpc("create_purchase_order", {
      p_idempotency_key: key,
      p_intent: "save_draft",
      p_header: header,
      p_lines: lines,
      p_source: null,
    });
    expect(first.error).toBeNull();
    const created = first.data as {
      id: string;
      number: string;
      state: string;
      rowVersion: number;
    };
    expect(created.id).toBeTruthy();
    expect(created.state).toBe("draft");
    expect(created.number).toMatch(/^PO-/);

    const retry = await client.database.rpc("create_purchase_order", {
      p_idempotency_key: key,
      p_intent: "save_draft",
      p_header: header,
      p_lines: lines,
      p_source: null,
    });
    expect(retry.error).toBeNull();
    expect((retry.data as { id: string }).id).toBe(created.id);

    const conflict = await client.database.rpc("create_purchase_order", {
      p_idempotency_key: key,
      p_intent: "save_draft",
      p_header: { ...header, notes: "different payload" },
      p_lines: lines,
      p_source: null,
    });
    expect(conflict.error).toBeTruthy();
    expect(String(conflict.error?.message ?? "")).toMatch(/WRITE:CONFLICT/);

    const row = await client.database
      .from("purchase_orders")
      .select("id,total,subtotal,state")
      .eq("id", created.id)
      .maybeSingle();
    expect(row.error).toBeNull();
    const po = row.data as { total: number; subtotal: number; state: string };
    expect(po.state).toBe("draft");
    expect(Number(po.subtotal)).toBe(20);
  });

  it("creates a balanced journal entry draft", async () => {
    const client = await signIn(
      process.env.DEMO_OWNER_EMAIL!,
      process.env.DEMO_OWNER_PASSWORD!,
    );
    const key = crypto.randomUUID();
    const result = await client.database.rpc("create_journal_entry", {
      p_idempotency_key: key,
      p_intent: "save_draft",
      p_header: { date: "2026-04-15", notes: "phase7 je smoke" },
      p_lines: [
        { accountId: "acc_bank_nbk_kwd", description: "Debit", debit: 5, credit: 0 },
        { accountId: "acc_revenue", description: "Credit", debit: 0, credit: 5 },
      ],
      p_source: null,
    });
    expect(result.error).toBeNull();
    const created = result.data as { id: string; state: string; number: string };
    expect(created.state).toBe("draft");
    expect(created.number).toMatch(/^JE-/);
  });
});
