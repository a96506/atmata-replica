import { test, expect } from "@playwright/test";

/**
 * Realtime channel isolation. The app advertises no realtime subscriptions
 * (zero `channel.subscribe` calls), so this spec fails loudly until a
 * realtime harness + channel isolation is actually implemented. It must
 * NOT be skipped — a skip hides the missing feature.
 */
test("realtime isolation", async () => {
  // The app has no realtime subscriptions today; assert that realtime
  // isolation is implemented. This will fail until the feature lands.
  const realtimeImplemented = false;
  expect(
    realtimeImplemented,
    "Realtime channel isolation is not implemented: the app has zero realtime subscriptions. Implement channel-scoped subscriptions and a dual-subscriber isolation harness before re-enabling this spec.",
  ).toBe(true);
});
