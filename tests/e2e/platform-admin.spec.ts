import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("platform-admin ui", () => {
  test("anonymous visitors are sent to login", async ({ request }) => {
    const response = await request.get(`${baseURL}/en/platform-admin`, {
      maxRedirects: 0,
    });
    expect([307, 308, 302]).toContain(response.status());
    const location = response.headers().location ?? "";
    expect(location).toContain("/en/login");
    expect(location).toContain("next=");
  });

  test("tenant admin cannot discover the surface", async ({ page }) => {
    test.skip(
      !process.env.DEMO_OWNER_EMAIL || !process.env.DEMO_OWNER_PASSWORD,
      "DEMO_OWNER credentials missing",
    );
    await page.goto(`${baseURL}/en/login?next=/platform-admin`);
    await page.getByLabel("Email").fill(process.env.DEMO_OWNER_EMAIL!);
    await page.getByLabel("Password").fill(process.env.DEMO_OWNER_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"));
    await page.goto(`${baseURL}/en/platform-admin`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("platform admin can open english and arabic consoles", async ({ page }) => {
    test.skip(
      !process.env.PLATFORM_ADMIN_EMAIL || !process.env.PLATFORM_ADMIN_PASSWORD,
      "PLATFORM_ADMIN credentials missing",
    );
    await page.goto(`${baseURL}/en/login?next=/platform-admin`);
    await page.getByLabel("Email").fill(process.env.PLATFORM_ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.PLATFORM_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/en/platform-admin");
    await expect(page.getByRole("heading", { name: "Platform administration" })).toBeVisible();
    await page.goto(`${baseURL}/ar/platform-admin`);
    await expect(page.getByRole("heading", { name: "إدارة المنصة" })).toBeVisible();
  });
});
