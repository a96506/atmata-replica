import { createAdminClient, createClient } from "@insforge/sdk";
import { describe, expect, it } from "vitest";

import { SCHEDULER_JOBS } from "@/lib/schedules/manifest";

const baseUrl = process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const apiKey = process.env.INSFORGE_API_KEY;

const configured = Boolean(baseUrl && anonKey && apiKey);

describe.skipIf(!configured)("scheduled-operations live RPCs", () => {
  it("revokes service RPCs from authenticated users", async () => {
    const email = process.env.DEMO_OWNER_EMAIL;
    const password = process.env.DEMO_OWNER_PASSWORD;
    if (!email || !password) return;
    const client = createClient({ baseUrl, anonKey });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    const user = createClient({
      baseUrl,
      anonKey,
      accessToken: data?.accessToken,
    });
    const denied = await user.database.rpc("run_scheduled_company_job", {
      p_company_id: "co_1",
      p_job_name: "aging_refresh",
      p_run_key: "probe-denied",
      p_payload: {},
    });
    expect(denied.error).toBeTruthy();
  });

  it("runs aging refresh idempotently for co_1", async () => {
    const admin = createAdminClient({ baseUrl: baseUrl!, apiKey: apiKey! });
    const runKey = `test-aging-${new Date().toISOString().slice(0, 10)}`;
    const first = await admin.database.rpc("run_scheduled_company_job", {
      p_company_id: "co_1",
      p_job_name: "aging_refresh",
      p_run_key: runKey,
      p_payload: {},
    });
    expect(first.error).toBeNull();
    const firstStatus = (first.data as { status?: string })?.status;
    expect(["succeeded", "skipped"]).toContain(firstStatus);

    const retry = await admin.database.rpc("run_scheduled_company_job", {
      p_company_id: "co_1",
      p_job_name: "aging_refresh",
      p_run_key: runKey,
      p_payload: {},
    });
    expect(retry.error).toBeNull();
    expect((retry.data as { status?: string })?.status).toBe("skipped");
  });

  it("exposes every scheduled job name", () => {
    expect(SCHEDULER_JOBS).toHaveLength(6);
  });
});
