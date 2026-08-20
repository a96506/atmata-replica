import { expect, test } from "@playwright/test";
import { authenticatedClient } from "./helpers";

async function demoAccessToken() {
  const baseUrl =
    process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
  const email = process.env.DEMO_OWNER_EMAIL;
  const password = process.env.DEMO_OWNER_PASSWORD;
  const response = await fetch(`${baseUrl}/api/auth/sessions?client_type=mobile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const session = (await response.json()) as { accessToken?: string };
  if (!baseUrl || !session.accessToken) throw new Error("Missing demo access token.");
  return { baseUrl, accessToken: session.accessToken };
}

test("email transport ignores arbitrary recipients and HTML", async () => {
  const client = await authenticatedClient();
  const { data, error } = await client.functions.invoke("email-send", {
    body: {
      event: "quote_sent",
      docId: "qt_1",
      locale: "en",
      idempotencyKey: `e2e-email-${Date.now()}`,
      recipient: "attacker@example.com",
      html: "<script>alert(1)</script>",
    },
  });
  expect(error).toBeNull();
  expect(data).toMatchObject({
    deliveryId: expect.any(String),
    duplicate: false,
  });
  expect(["sent", "skipped"]).toContain(
    (data as { status?: string } | null)?.status,
  );
});

test("quote and RFQ mail resolve schema emails", async () => {
  const client = await authenticatedClient();
  const quote = await client.functions.invoke("email-send", {
    body: {
      event: "quote_sent",
      docId: "qt_1",
      locale: "en",
      idempotencyKey: `e2e-quote-${Date.now()}`,
    },
  });
  expect(quote.error).toBeNull();
  const rfq = await client.functions.invoke("email-send", {
    body: {
      event: "rfq_invitation",
      docId: "rfq_1",
      locale: "en",
      idempotencyKey: `e2e-rfq-${Date.now()}`,
    },
  });
  expect(rfq.error).toBeNull();
});

test("user invitation returns a raw acceptance link without storing plaintext", async () => {
  const client = await authenticatedClient();
  const { baseUrl, accessToken } = await demoAccessToken();
  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const inviteRes = await fetch(`${baseUrl}/api/database/rpc/invite_user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_email: "invitee@example.com",
      p_roles: ["viewer"],
      p_request_id: crypto.randomUUID(),
      p_token_hash: tokenHash,
    }),
  });
  const invited = (await inviteRes.json()) as { id?: string };
  expect(inviteRes.ok).toBeTruthy();
  const invitationId =
    invited && typeof invited === "object" && "id" in invited
      ? String((invited as { id: string }).id)
      : "";
  expect(invitationId).toBeTruthy();
  const { data, error } = await client.functions.invoke("email-send", {
    body: {
      event: "user_invitation",
      invitationId,
      locale: "en",
      idempotencyKey: `e2e-invite-${Date.now()}`,
    },
  });
  expect(error).toBeNull();
  const link = (data as { invitationLink?: string } | null)?.invitationLink ?? "";
  expect(link).toContain("/invitation?token=");
  expect(link.includes(token)).toBe(false);
});
