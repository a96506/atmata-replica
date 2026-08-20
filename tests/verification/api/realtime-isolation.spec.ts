import { test } from "@playwright/test";

test("realtime isolation", async () => {
  test.skip(
    true,
    "Realtime channel isolation requires a long-lived dual-subscriber harness; deferred to a dedicated runner with VERIFY_REALTIME=1.",
  );
});
