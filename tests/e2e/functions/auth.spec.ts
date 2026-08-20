import { expect, test } from "@playwright/test";

const slugs = [
  "pdf-gen",
  "email-send",
  "ocr-vendor-bill",
  "reconciliation-suggest",
  "ai-assistant",
  "erp-scheduler",
] as const;

for (const slug of slugs) {
  test(`${slug} requires caller authentication`, async () => {
    const baseUrl =
      process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
    test.skip(!baseUrl, "InsForge URL is not configured.");
    const response = await fetch(`${baseUrl}/functions/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      error?: { code?: string; requestId?: string; retryable?: boolean };
    };
    expect(body.error?.code).toBe("UNAUTHENTICATED");
    expect(body.error?.requestId).toEqual(expect.any(String));
    expect(body.error?.retryable).toBe(false);
  });
}
