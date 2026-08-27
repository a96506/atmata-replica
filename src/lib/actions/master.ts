"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import {
  createRequestId,
  KnownActionError,
  normalizeActionError,
} from "@/lib/actions/errors";
import type { ActionResult } from "@/lib/actions/result";
import { validateActionInput } from "@/lib/actions/validation";
import { camelize, snakelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import {
  createApprovalRuleSchema,
  createBankAccountSchema,
  createCustomerSchema,
  createPriceListSchema,
  createProductSchema,
  createSupplierSchema,
  createTaxCodeSchema,
  deleteApprovalRuleSchema,
  deleteBankAccountSchema,
  deleteCustomerSchema,
  deletePriceListSchema,
  deleteProductSchema,
  deleteSupplierSchema,
  deleteTaxCodeSchema,
  updateApprovalRuleSchema,
  updateBankAccountSchema,
  updateCompanyProfileSchema,
  updateCustomerSchema,
  updatePriceListSchema,
  updateProductSchema,
  updateSupplierSchema,
  updateTaxCodeSchema,
} from "@/lib/actions/validation/master";

/**
 * Master-data CRUD. No write RPCs exist for master tables, so we use the
 * InsForge SDK directly. RLS (`company_isolation` policy) + the
 * `guard_company_id` trigger scope every row to the caller's company — we
 * omit `company_id` on INSERT and the trigger fills it; UPDATE/DELETE are
 * filtered by `id` and RLS rejects cross-tenant rows.
 */

type DbError = { message?: string; code?: string } | null;

function revalidateSettings(locale: "en" | "ar", slug: string) {
  revalidatePath(`/${locale}/settings/${slug}`);
  revalidatePath(`/settings/${slug}`);
}

/** Insert one row, returning the camelized new row. */
async function insertRow<T>(
  table: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database
    .from(table)
    .insert([snakelize(payload)])
    .select()
    .maybeSingle();
  if (error) throwDb(error, table);
  if (data == null) throw new KnownActionError("INTERNAL");
  return camelize<T>(data);
}

/** Update one row by id, returning the camelized updated row. */
async function updateRow<T>(
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<T> {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.database
    .from(table)
    .update(snakelize(patch))
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throwDb(error, table);
  if (data == null) throw new KnownActionError("NOT_FOUND");
  return camelize<T>(data);
}

/** Delete one row by id. */
async function deleteRow(table: string, id: string): Promise<void> {
  const client = await createInsForgeServerClient();
  const { error } = await client.database.from(table).delete().eq("id", id);
  if (error) throwDb(error, table);
}

function throwDb(error: DbError, _table: string): never {
  const msg = error?.message ?? "";
  // Postgres unique-violation / not-null / check / FK errors arrive here.
  // Surface a clean VALIDATION/CONFLICT/INTERNAL code rather than a raw dump.
  if (/unique/i.test(msg) || /duplicate key/i.test(msg)) {
    throw new KnownActionError("DUPLICATE", { messageKey: "errors.duplicate" });
  }
  if (/foreign key/i.test(msg) || /violates foreign key/i.test(msg)) {
    throw new KnownActionError("VALIDATION", {
      messageKey: "errors.validation",
    });
  }
  if (/not-null/i.test(msg) || /check/i.test(msg)) {
    throw new KnownActionError("VALIDATION", {
      messageKey: "errors.validation",
    });
  }
  // RLS denial or anything unexpected.
  throw new KnownActionError("INTERNAL", { messageKey: "errors.internal" });
}

export type MasterRow = { id: string };

// --- Products ---------------------------------------------------------------

export async function createProductAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createProductSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, ...payload } = parsed.data;
    const row = await insertRow<MasterRow>("products", payload);
    revalidateSettings(locale, "products");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function updateProductAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updateProductSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, ...patch } = parsed.data;
    const row = await updateRow<MasterRow>("products", id, patch);
    revalidateSettings(locale, "products");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deleteProductAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deleteProductSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await deleteRow("products", parsed.data.id);
    revalidateSettings(parsed.data.locale, "products");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

// --- Suppliers -------------------------------------------------------------

export async function createSupplierAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createSupplierSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, ...payload } = parsed.data;
    const row = await insertRow<MasterRow>("suppliers", payload);
    revalidateSettings(locale, "suppliers");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function updateSupplierAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updateSupplierSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, ...patch } = parsed.data;
    const row = await updateRow<MasterRow>("suppliers", id, patch);
    revalidateSettings(locale, "suppliers");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deleteSupplierAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deleteSupplierSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await deleteRow("suppliers", parsed.data.id);
    revalidateSettings(parsed.data.locale, "suppliers");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

// --- Customers -------------------------------------------------------------

export async function createCustomerAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createCustomerSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, ...payload } = parsed.data;
    const row = await insertRow<MasterRow>("customers", payload);
    revalidateSettings(locale, "customers");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function updateCustomerAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updateCustomerSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, ...patch } = parsed.data;
    const row = await updateRow<MasterRow>("customers", id, patch);
    revalidateSettings(locale, "customers");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deleteCustomerAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deleteCustomerSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await deleteRow("customers", parsed.data.id);
    revalidateSettings(parsed.data.locale, "customers");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

// --- Bank accounts ---------------------------------------------------------

export async function createBankAccountAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createBankAccountSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, ...payload } = parsed.data;
    const row = await insertRow<MasterRow>("bank_accounts", payload);
    revalidateSettings(locale, "bank-accounts");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function updateBankAccountAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updateBankAccountSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, ...patch } = parsed.data;
    const row = await updateRow<MasterRow>("bank_accounts", id, patch);
    revalidateSettings(locale, "bank-accounts");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deleteBankAccountAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deleteBankAccountSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await deleteRow("bank_accounts", parsed.data.id);
    revalidateSettings(parsed.data.locale, "bank-accounts");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

// --- Approval rules --------------------------------------------------------

export async function createApprovalRuleAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createApprovalRuleSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, ...payload } = parsed.data;
    const row = await insertRow<MasterRow>("approval_rules", payload);
    revalidateSettings(locale, "approval-rules");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function updateApprovalRuleAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updateApprovalRuleSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, ...patch } = parsed.data;
    const row = await updateRow<MasterRow>("approval_rules", id, patch);
    revalidateSettings(locale, "approval-rules");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deleteApprovalRuleAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deleteApprovalRuleSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await deleteRow("approval_rules", parsed.data.id);
    revalidateSettings(parsed.data.locale, "approval-rules");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

// --- Tax codes -------------------------------------------------------------

export async function createTaxCodeAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createTaxCodeSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, ...payload } = parsed.data;
    const row = await insertRow<MasterRow>("tax_codes", payload);
    revalidateSettings(locale, "tax-codes");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function updateTaxCodeAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updateTaxCodeSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, ...patch } = parsed.data;
    const row = await updateRow<MasterRow>("tax_codes", id, patch);
    revalidateSettings(locale, "tax-codes");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deleteTaxCodeAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deleteTaxCodeSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await deleteRow("tax_codes", parsed.data.id);
    revalidateSettings(parsed.data.locale, "tax-codes");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

// --- Price lists -----------------------------------------------------------

export async function createPriceListAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(createPriceListSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, ...payload } = parsed.data;
    const row = await insertRow<MasterRow>("price_lists", payload);
    revalidateSettings(locale, "price-lists");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function updatePriceListAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(updatePriceListSchema, input, requestId);
    if (!parsed.ok) return parsed;
    const { locale, id, ...patch } = parsed.data;
    const row = await updateRow<MasterRow>("price_lists", id, patch);
    revalidateSettings(locale, "price-lists");
    return { ok: true, data: row };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

export async function deletePriceListAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(deletePriceListSchema, input, requestId);
    if (!parsed.ok) return parsed;
    await deleteRow("price_lists", parsed.data.id);
    revalidateSettings(parsed.data.locale, "price-lists");
    return { ok: true, data: { id: parsed.data.id } };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}

// --- Company profile (tenant self-update) ----------------------------------

export async function updateCompanyProfileAction(
  input: unknown,
): Promise<ActionResult<MasterRow>> {
  const requestId = createRequestId();
  try {
    const parsed = validateActionInput(
      updateCompanyProfileSchema,
      input,
      requestId,
    );
    if (!parsed.ok) return parsed;
    const { locale, ...patch } = parsed.data;
    // RLS `company_admin_update` policy scopes to my_company_id(); we update
    // the single visible row. Empty patch is rejected by the schema (all
    // fields optional, but at least one must be present — enforced here).
    if (Object.keys(patch).length === 0) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          messageKey: "errors.validation",
          retryable: false,
          requestId,
        },
      };
    }
    const client = await createInsForgeServerClient();
    const { data, error } = await client.database
      .from("companies")
      .update(snakelize(patch))
      .select("id")
      .maybeSingle();
    if (error) throwDb(error, "companies");
    if (data == null) throw new KnownActionError("NOT_FOUND");
    revalidateSettings(locale, "company");
    return { ok: true, data: camelize<MasterRow>(data) };
  } catch (error) {
    return normalizeActionError(error, { requestId });
  }
}
