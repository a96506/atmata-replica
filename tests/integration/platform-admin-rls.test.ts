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
    process.env.PLATFORM_ADMIN_EMAIL &&
    process.env.PLATFORM_ADMIN_PASSWORD &&
    process.env.DEMO_OWNER_EMAIL &&
    process.env.DEMO_OWNER_PASSWORD,
);

describe.skipIf(!configured)("platform-admin RLS", () => {
  it("denies tenant admins and allows platform admins", async () => {
    const tenant = await signIn(
      process.env.DEMO_OWNER_EMAIL!,
      process.env.DEMO_OWNER_PASSWORD!,
    );
    const tenantDenied = await tenant.database.rpc("platform_list_companies", {
      p_search: null,
      p_status: null,
      p_offset: 0,
      p_limit: 10,
    });
    expect(tenantDenied.error).toBeTruthy();

    const platform = await signIn(
      process.env.PLATFORM_ADMIN_EMAIL!,
      process.env.PLATFORM_ADMIN_PASSWORD!,
    );
    const listed = await platform.database.rpc("platform_list_companies", {
      p_search: null,
      p_status: null,
      p_offset: 0,
      p_limit: 10,
    });
    expect(listed.error).toBeNull();
    expect(listed.data).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });

    const drift = await platform.database.rpc("company_table_allowlist_violations");
    expect(drift.error).toBeNull();
    expect(drift.data ?? []).toEqual([]);
  });
});
