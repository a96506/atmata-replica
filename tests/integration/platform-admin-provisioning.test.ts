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
  baseUrl && anonKey && process.env.PLATFORM_ADMIN_EMAIL && process.env.PLATFORM_ADMIN_PASSWORD,
);

describe.skipIf(!configured)("platform-admin provisioning", () => {
  it("is retry-safe and rejects an email already bound to a company", async () => {
    const platform = await signIn(
      process.env.PLATFORM_ADMIN_EMAIL!,
      process.env.PLATFORM_ADMIN_PASSWORD!,
    );
    const operationId = crypto.randomUUID();
    const ownerEmail = `phase4.${operationId.slice(0, 8)}@atmata.example`;
    const first = await platform.database.rpc("platform_provision_company", {
      p_operation_id: operationId,
      p_name: "Phase 4 Co",
      p_owner_email: ownerEmail,
      p_owner_name: "Phase Four",
    });
    expect(first.error).toBeNull();
    const companyId = (first.data as { companyId: string }).companyId;
    expect(companyId).toBeTruthy();
    expect((first.data as { invitationToken: string }).invitationToken).toMatch(/^[0-9a-f]{64}$/);

    const retry = await platform.database.rpc("platform_provision_company", {
      p_operation_id: operationId,
      p_name: "Phase 4 Co",
      p_owner_email: ownerEmail,
      p_owner_name: "Phase Four",
    });
    expect(retry.error).toBeNull();
    expect((retry.data as { companyId: string }).companyId).toBe(companyId);

    const conflict = await platform.database.rpc("platform_provision_company", {
      p_operation_id: crypto.randomUUID(),
      p_name: "Other Co",
      p_owner_email: process.env.DEMO_OWNER_EMAIL ?? "123@gmail.com",
      p_owner_name: "Taken",
    });
    expect(conflict.error).toBeTruthy();

    const company = await platform.database.rpc("platform_get_company", {
      p_company_id: companyId,
    });
    expect(company.error).toBeNull();
    const rowVersion = (company.data as { rowVersion: number }).rowVersion;
    const suspended = await platform.database.rpc("platform_set_company_status", {
      p_company_id: companyId,
      p_status: "suspended",
      p_expected_row_version: rowVersion,
      p_reason: "phase 4 isolation",
    });
    expect(suspended.error).toBeNull();
    expect((suspended.data as { status: string }).status).toBe("suspended");

    const stale = await platform.database.rpc("platform_set_company_status", {
      p_company_id: companyId,
      p_status: "active",
      p_expected_row_version: rowVersion,
      p_reason: null,
    });
    expect(stale.error).toBeTruthy();

    const counts = await platform.database.rpc("platform_company_row_counts", {
      p_company_id: companyId,
    });
    expect(counts.error).toBeNull();
    expect((counts.data as { totalRows: number }).totalRows).toBeGreaterThan(0);
  });
});
