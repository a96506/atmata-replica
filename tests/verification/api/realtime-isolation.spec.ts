import { test, expect } from "@playwright/test";

/**
 * Tenant realtime channel isolation harness (deferred).
 *
 * Platform job-queue realtime is already used in-process (worker wakes on
 * NOTIFY). This spec still fails loudly until a dual-subscriber tenant
 * channel-isolation harness exists. It must NOT be skipped — a skip hides
 * the missing isolation check.
 */
test("realtime isolation", async () => {
  // Tenant channel isolation harness is not implemented yet; platform
  // job-queue realtime usage does not satisfy this gate.
  const tenantChannelIsolationHarness = false;
  expect(
    tenantChannelIsolationHarness,
    "Tenant realtime channel isolation harness is not implemented (platform job-queue realtime is used separately). Add channel-scoped subscriptions and a dual-subscriber isolation harness before re-enabling this spec.",
  ).toBe(true);
});
