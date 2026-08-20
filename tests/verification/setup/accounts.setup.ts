import { test as setup } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  demoOwner,
  loadLocalEnv,
  platformAccount,
  tenantAOwner,
  tenantBOwner,
} from "../fixtures/accounts";

loadLocalEnv();

const authDir = resolve(process.cwd(), "verification/results/.auth");
mkdirSync(authDir, { recursive: true });

async function loginAndSave(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  file: string,
) {
  const base =
    process.env.PLAYWRIGHT_BASE_URL ??
    process.env.VERIFY_BASE_URL ??
    "http://127.0.0.1:3000";
  await page.goto(`${base}/en/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
  await page.context().storageState({ path: resolve(authDir, file) });
}

setup("platform storageState", async ({ page }) => {
  const account = platformAccount();
  setup.skip(!account, "VERIFY_PLATFORM_* / PLATFORM_ADMIN_* credentials missing");
  await loginAndSave(page, account!.email, account!.password, "platform.json");
});

setup("demo owner storageState", async ({ page }) => {
  const account = demoOwner();
  setup.skip(!account, "DEMO_OWNER_* credentials missing");
  await loginAndSave(page, account!.email, account!.password, "demo-owner.json");
});

setup("tenant A owner storageState", async ({ page }) => {
  const account = tenantAOwner();
  setup.skip(!account, "VERIFY_A_OWNER_* credentials missing");
  await loginAndSave(page, account!.email, account!.password, "a-owner.json");
});

setup("tenant B owner storageState", async ({ page }) => {
  const account = tenantBOwner();
  setup.skip(!account, "VERIFY_B_OWNER_* credentials missing");
  await loginAndSave(page, account!.email, account!.password, "b-owner.json");
});
