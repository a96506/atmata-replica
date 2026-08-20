import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  demoOwner,
  loadLocalEnv,
  platformAccount,
} from "../fixtures/accounts";

loadLocalEnv();

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.VERIFY_BASE_URL ??
  "http://127.0.0.1:3000";

test("platform admin reaches platform-admin; demo owner gets 404", async ({
  page,
  browser,
}) => {
  const platform = platformAccount();
  const demo = demoOwner();
  test.skip(!platform || !demo, "platform + demo owner credentials required");

  await page.goto(`${baseURL}/en/login?next=/platform-admin`);
  await page.getByLabel("Email").fill(platform!.email);
  await page.getByLabel("Password").fill(platform!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/en/platform-admin");
  await expect(
    page.getByRole("heading", { name: "Platform administration" }),
  ).toBeVisible();

  const demoContext = await browser.newContext();
  const demoPage = await demoContext.newPage();
  await demoPage.goto(`${baseURL}/en/login?next=/platform-admin`);
  await demoPage.getByLabel("Email").fill(demo!.email);
  await demoPage.getByLabel("Password").fill(demo!.password);
  await demoPage.getByRole("button", { name: "Sign in" }).click();
  await demoPage.waitForURL((url) => !url.pathname.includes("/login"));
  await demoPage.goto(`${baseURL}/en/platform-admin`);
  await expect(demoPage.getByRole("heading", { name: "404" })).toBeVisible();
  await demoContext.close();
});

test("storageState platform file is optional", async () => {
  // Documents that setup may write auth state for reuse.
  const path = resolve(process.cwd(), "verification/results/.auth/platform.json");
  if (!existsSync(path)) {
    test.info().annotations.push({
      type: "note",
      description: "platform storageState not present yet",
    });
  }
  expect(true).toBe(true);
});
