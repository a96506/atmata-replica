import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";

export function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
}

loadLocalEnv();

export async function authenticatedClient() {
  const baseUrl =
    process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
  const email = process.env.DEMO_OWNER_EMAIL;
  const password = process.env.DEMO_OWNER_PASSWORD;
  test.skip(
    !baseUrl || !anonKey || !email || !password,
    "Function e2e credentials are not configured.",
  );
  const response = await fetch(`${baseUrl}/api/auth/sessions?client_type=mobile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Unable to authenticate function test user.");
  const session = (await response.json()) as { accessToken?: string };
  if (!session.accessToken) throw new Error("Function test session has no access token.");
  return {
    functions: {
      async invoke(slug: string, options: { body: unknown }) {
        const result = await fetch(`${baseUrl}/functions/${slug}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(options.body),
        });
        const data = await result.json().catch(() => null);
        return result.ok
          ? { data, error: null }
          : { data: null, error: data ?? new Error(`Function returned ${result.status}`) };
      },
    },
  };
}
