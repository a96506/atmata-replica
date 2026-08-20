import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("user-admin ui", () => {
  test("viewer-style anonymous visitors never see member rows", async ({ request }) => {
    const response = await request.get(`${baseURL}/en/settings/users`, {
      maxRedirects: 0,
    });
    expect([307, 308, 302]).toContain(response.status());
    const location = response.headers().location ?? "";
    expect(location).toContain("/en/login");
  });

  test("company admin can open english and arabic user admin", async ({ page }) => {
    test.skip(
      !process.env.DEMO_OWNER_EMAIL || !process.env.DEMO_OWNER_PASSWORD,
      "DEMO_OWNER credentials missing",
    );
    await page.goto(`${baseURL}/en/login?next=/settings/users`);
    await page.getByLabel("Email").fill(process.env.DEMO_OWNER_EMAIL!);
    await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/en/settings/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite user" })).toBeVisible();
    await page.goto(`${baseURL}/ar/settings/users`);
    await expect(page.getByRole("heading", { name: "المستخدمون" })).toBeVisible();
  });

  test("invite keeps the fallback link visible", async ({ page }) => {
    test.skip(
      !process.env.DEMO_OWNER_EMAIL || !process.env.DEMO_OWNER_PASSWORD,
      "DEMO_OWNER credentials missing",
    );
    await page.goto(`${baseURL}/en/login?next=/settings/users`);
    await page.getByLabel("Email").fill(process.env.DEMO_OWNER_EMAIL!);
    await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/en/settings/users");
    await page.getByRole("button", { name: "Invite user" }).click();
    const email = `e2e.ui.${Date.now()}@atmata.example`;
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(
      page.getByRole("button", { name: /Copy invitation link|Copied/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("span.break-all.font-mono")).toContainText(
      "/invitation?token=",
    );
  });
});
