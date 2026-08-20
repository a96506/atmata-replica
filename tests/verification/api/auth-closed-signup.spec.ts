import { expect, test } from "@playwright/test";
import {
  anonKey,
  insforgeBaseUrl,
  loadLocalEnv,
} from "../fixtures/accounts";

loadLocalEnv();

test("public signUp is denied", async () => {
  const baseUrl = insforgeBaseUrl();
  const key = anonKey();
  test.skip(!baseUrl || !key, "InsForge URL/anon key missing");

  const email = `closed.signup.${Date.now()}@example.invalid`;
  const response = await fetch(`${baseUrl}/api/auth/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password: "VerifyClosedSignup1!",
      name: "Closed Signup Probe",
    }),
  });

  // Closed signup should not create a usable session/user.
  expect(response.ok).toBe(false);
  expect(response.status).toBeGreaterThanOrEqual(400);
  const body = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string; code?: string };
    message?: string;
  };
  const text = JSON.stringify(body).toLowerCase();
  expect(
    text.includes("sign") ||
      text.includes("disabled") ||
      text.includes("forbidden") ||
      text.includes("not allowed") ||
      text.includes("closed") ||
      response.status === 403 ||
      response.status === 401 ||
      response.status === 400,
  ).toBe(true);
});
