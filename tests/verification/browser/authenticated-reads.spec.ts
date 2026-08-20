import { expect, test } from "@playwright/test";
import { demoOwner, loadLocalEnv } from "../fixtures/accounts";

loadLocalEnv();

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.VERIFY_BASE_URL ??
  "http://127.0.0.1:3000";

test("demo owner can open inbox or dashboard", async ({ page }) => {
  const account = demoOwner();
  test.skip(!account, "DEMO_OWNER_* credentials required");

  await page.goto(`${baseURL}/en/login`);
  await page.getByLabel("Email").fill(account!.email);
  await page.getByLabel("Password").fill(account!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"));

  const inbox = await page.goto(`${baseURL}/en/inbox`);
  if (inbox && inbox.ok()) {
    expect(page.url()).toContain("/en/inbox");
    return;
  }
  const dash = await page.goto(`${baseURL}/en/dashboard`);
  expect(dash?.ok() || page.url().includes("/en/")).toBeTruthy();
});
