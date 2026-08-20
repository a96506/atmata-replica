/**
 * Seed minimal curated master data + one draft PO on VERIFY tenants.
 *
 * Pattern (multi-tenant SaaS E2E): per-tenant synthetic factories that return
 * explicit IDs; keep FKs inside the same tenant; never touch co_1.
 * @see https://getautonoma.com/blog/multi-tenant-saas-testing
 * @see https://qaskills.sh/blog/test-data-referential-integrity-seeding
 *
 * Prerequisites: `npm run bootstrap:verify-tenants` (VERIFY_* in .env.local).
 * Does not mutate co_1. Requires VERIFY_ALLOW_MUTATION=erp-backend-v1.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-verify-master-data.mjs
 *   node --env-file=.env.local scripts/seed-verify-master-data.mjs --tenant=A
 *   node --env-file=.env.local scripts/seed-verify-master-data.mjs --dry-run
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@insforge/sdk";

const DEMO_COMPANY_ID = "co_1";
const SKU = "VF-RM-01";
const SUPPLIER_NAME = "VF Verify Supplier";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

class SeedError extends Error {}

function abort(message) {
  throw new SeedError(message);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) abort(`Missing required environment variable: ${name}.`);
  return value;
}

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

async function signIn(baseUrl, anonKey, email, password) {
  const client = createClient({ baseUrl, anonKey });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.accessToken) {
    abort(`Sign-in failed for ${email}: ${error?.message ?? "no token"}`);
  }
  return createClient({
    baseUrl,
    anonKey,
    accessToken: data.accessToken,
  });
}

async function companyIdOf(client) {
  const { data, error } = await client.database.rpc("my_company_id");
  if (error || !data) abort(`my_company_id failed: ${error?.message ?? "empty"}`);
  if (data === DEMO_COMPANY_ID) abort("Refusing to seed co_1.");
  return data;
}

async function firstRow(client, table, select, eq) {
  let q = client.database.from(table).select(select).limit(1);
  if (eq) {
    for (const [col, val] of Object.entries(eq)) {
      q = q.eq(col, val);
    }
  }
  const { data, error } = await q;
  if (error) abort(`${table} select failed: ${error.message}`);
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows[0] ?? null;
}

async function ensureProduct(client, companyId, taxCodeId, dryRun) {
  const existing = await firstRow(client, "products", "id,sku", { sku: SKU });
  if (existing?.id) {
    console.log(`  product: reuse ${existing.id} (${SKU})`);
    return existing.id;
  }
  if (dryRun) {
    console.log(`  product: would insert ${SKU}`);
    return null;
  }
  const id = `prod-vf-${companyId.slice(0, 8)}`;
  const { data, error } = await client.database
    .from("products")
    .insert([
      {
        id,
        sku: SKU,
        name: "VF Resin bag",
        uom: "BAG",
        tax_code_id: taxCodeId,
        costing_method: "AVG",
        lot_tracked: false,
        purchasable: true,
        sellable: false,
        default_purchase_price: 10,
        default_sale_price: 0,
      },
    ])
    .select("id")
    .single();
  if (error) abort(`product insert failed: ${error.message}`);
  console.log(`  product: created ${data.id}`);
  return data.id;
}

async function ensureSupplier(client, companyId, paymentTermId, dryRun) {
  const existing = await firstRow(client, "suppliers", "id,name", {
    name: SUPPLIER_NAME,
  });
  if (existing?.id) {
    console.log(`  supplier: reuse ${existing.id}`);
    return existing.id;
  }
  if (dryRun) {
    console.log(`  supplier: would insert ${SUPPLIER_NAME}`);
    return null;
  }
  const id = `sup-vf-${companyId.slice(0, 8)}`;
  const { data, error } = await client.database
    .from("suppliers")
    .insert([
      {
        id,
        name: SUPPLIER_NAME,
        email: `vf-supplier-${companyId.slice(0, 8)}@vendors.example`,
        vat_number: null,
        bank_account: null,
        payment_term_id: paymentTermId,
        wht_applicable: false,
        wht_rate: null,
        active: true,
      },
    ])
    .select("id")
    .single();
  if (error) abort(`supplier insert failed: ${error.message}`);
  console.log(`  supplier: created ${data.id}`);
  return data.id;
}

async function ensureDraftPo(client, ids, runId, dryRun) {
  const existing = await firstRow(client, "purchase_orders", "id,number,row_version,state", {
    notes: `vf-seed-po ${runId}`,
  });
  if (existing?.id) {
    console.log(`  po: reuse ${existing.id} (${existing.number})`);
    return existing;
  }

  const today = new Date().toISOString().slice(0, 10);
  const expected = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const header = {
    supplierId: ids.supplierId,
    currency: "KWD",
    paymentTermId: ids.paymentTermId,
    warehouseId: ids.warehouseId,
    date: today,
    expectedDate: expected,
    notes: `vf-seed-po ${runId}`,
  };
  const lines = [
    {
      productId: ids.productId,
      description: "VF seed line",
      qty: 2,
      unitPrice: 10,
      taxCodeId: ids.taxCodeId,
    },
  ];

  if (dryRun) {
    console.log("  po: would create_purchase_order");
    return null;
  }

  const key = `vf-seed-po-${ids.companyId}-${runId}`;
  const { data, error } = await client.database.rpc("create_purchase_order", {
    p_idempotency_key: key,
    p_intent: "save_draft",
    p_header: header,
    p_lines: lines,
    p_source: null,
  });
  if (error) abort(`create_purchase_order failed: ${error.message}`);
  const created = data ?? {};
  console.log(`  po: created ${created.id ?? created.documentId} (${created.number ?? "?"})`);
  return {
    id: created.id ?? created.documentId,
    number: created.number,
    row_version: created.rowVersion ?? 1,
    state: created.state ?? "draft",
  };
}

async function seedTenant(label, email, password, baseUrl, anonKey, runId, dryRun) {
  console.log(`\nTenant ${label}: ${email}`);
  const client = await signIn(baseUrl, anonKey, email, password);
  const companyId = await companyIdOf(client);
  console.log(`  company: ${companyId}`);

  const warehouse = await firstRow(client, "warehouses", "id,code");
  const paymentTerm = await firstRow(client, "payment_terms", "id,code");
  const taxCode = await firstRow(client, "tax_codes", "id,code");
  if (!warehouse?.id || !paymentTerm?.id || !taxCode?.id) {
    abort(
      `Tenant ${label} missing seed_company_defaults rows (warehouse/payment_terms/tax_codes).`,
    );
  }

  const productId = await ensureProduct(client, companyId, taxCode.id, dryRun);
  const supplierId = await ensureSupplier(
    client,
    companyId,
    paymentTerm.id,
    dryRun,
  );

  const ids = {
    companyId,
    warehouseId: warehouse.id,
    paymentTermId: paymentTerm.id,
    taxCodeId: taxCode.id,
    productId,
    supplierId,
  };

  const po =
    productId && supplierId
      ? await ensureDraftPo(client, ids, runId, dryRun)
      : null;

  return {
    label,
    email,
    ...ids,
    purchaseOrderId: po?.id ?? null,
    purchaseOrderNumber: po?.number ?? null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const only = tenantArg ? tenantArg.slice("--tenant=".length).toUpperCase() : "AB";
  const unknown = args.filter(
    (a) => a !== "--dry-run" && !a.startsWith("--tenant="),
  );
  if (unknown.length) abort(`Unsupported argument: ${unknown[0]}`);

  if (process.env.VERIFY_ALLOW_MUTATION !== "erp-backend-v1") {
    abort("VERIFY_ALLOW_MUTATION must be erp-backend-v1.");
  }

  const rawBase =
    process.env.INSFORGE_URL?.trim() ||
    process.env.NEXT_PUBLIC_INSFORGE_URL?.trim();
  if (!rawBase) abort("Missing INSFORGE_URL / NEXT_PUBLIC_INSFORGE_URL.");
  const baseUrl = normalizeUrl(rawBase);
  const anonKey = requiredEnv("NEXT_PUBLIC_INSFORGE_ANON_KEY");
  const runId =
    process.env.VERIFY_RUN_ID?.trim() ||
    `vf_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_seed`;

  const tenants = [];
  if (only.includes("A")) {
    tenants.push(
      await seedTenant(
        "A",
        requiredEnv("VERIFY_A_OWNER_EMAIL"),
        requiredEnv("VERIFY_A_OWNER_PASSWORD"),
        baseUrl,
        anonKey,
        runId,
        dryRun,
      ),
    );
  }
  if (only.includes("B")) {
    tenants.push(
      await seedTenant(
        "B",
        requiredEnv("VERIFY_B_OWNER_EMAIL"),
        requiredEnv("VERIFY_B_OWNER_PASSWORD"),
        baseUrl,
        anonKey,
        runId,
        dryRun,
      ),
    );
  }

  const outDir = resolve(ROOT, "verification/results", runId);
  const payload = {
    runId,
    seededAt: new Date().toISOString(),
    tenants,
    note: "Synthetic VERIFY master data; no secrets. Does not touch co_1.",
  };

  if (!dryRun) {
    await mkdir(outDir, { recursive: true });
    const path = resolve(outDir, "verify-seed-state.json");
    await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${path}`);
  } else {
    console.log("\nDry run complete; no writes.");
  }

  console.log(
    JSON.stringify(
      {
        tenants: tenants.map((t) => ({
          label: t.label,
          companyId: t.companyId,
          productId: t.productId,
          supplierId: t.supplierId,
          purchaseOrderId: t.purchaseOrderId,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message =
    error instanceof SeedError
      ? error.message
      : error?.message ?? "Unexpected seed failure.";
  console.error(`Verify master-data seed failed: ${message}`);
  process.exitCode = 1;
});
