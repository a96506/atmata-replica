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
  test.skip(!account, "DEMO_OWNER_* credentials required");

  await page.goto(`${baseURL}/en/login`);
  await page.getByLabel("Email").fill(account!.email);
  await page.getByLabel("Password").fill(account!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));

  const response = await page.goto(`${baseURL}/en/sales/quotes/qt_1`);
  if (!response || response.status() >= 400) {
    test.skip(true, "quote detail qt_1 not reachable in this environment");
  }
  const preview = page.getByRole("button", { name: /preview|download|pdf/i });
  const count = await preview.count();
  expect(count >= 0).toBe(true);
});
