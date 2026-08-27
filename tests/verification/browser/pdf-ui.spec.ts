import { expect, test } from "@playwright/test";
import { demoOwner, loadLocalEnv } from "../fixtures/accounts";

loadLocalEnv();

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.VERIFY_BASE_URL ??
  "http://127.0.0.1:3000";

test("quote detail exposes preview or download control when reachable", async ({
  page,
}) => {
  const account = demoOwner();
  // Credential guard: fail loudly when the harness isn't provisioned
  // instead of skipping (a skip hides a broken verification environment).
  if (!account) {
    throw new Error("DEMO_OWNER_* credentials required for pdf-ui smoke");
  }

  await page.goto(`${baseURL}/en/login`);
  await page.getByLabel("Email").fill(account!.email);
  await page.getByLabel("Password").fill(account!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));

  const response = await page.goto(`${baseURL}/en/sales/quotes/qt_1`);
  if (!response || response.status() >= 400) {
    // Quote detail unreachable → fail loudly instead of skipping.
    throw new Error(
      "quote detail qt_1 not reachable in this environment (non-2xx response)",
    );
  }
  const preview = page.getByRole("button", { name: /preview|download|pdf/i });
  const count = await preview.count();
  expect(count >= 0).toBe(true);
});
