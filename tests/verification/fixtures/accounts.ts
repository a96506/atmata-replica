import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1);
    }
  }
  if (!process.env.VERIFY_PLATFORM_EMAIL && process.env.PLATFORM_ADMIN_EMAIL) {
    process.env.VERIFY_PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL;
  }
  if (!process.env.VERIFY_PLATFORM_PASSWORD && process.env.PLATFORM_ADMIN_PASSWORD) {
    process.env.VERIFY_PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD;
  }
}

loadLocalEnv();

export type VerifyAccount = {
  email: string;
  password: string;
  label: string;
};

function pair(emailKey: string, passwordKey: string, label: string): VerifyAccount | null {
  const email = process.env[emailKey];
  const password = process.env[passwordKey];
  if (!email || !password) return null;
  return { email, password, label };
}

export function platformAccount() {
  return pair("VERIFY_PLATFORM_EMAIL", "VERIFY_PLATFORM_PASSWORD", "platform");
}

export function tenantAOwner() {
  return pair("VERIFY_A_OWNER_EMAIL", "VERIFY_A_OWNER_PASSWORD", "a-owner");
}

export function tenantAViewer() {
  return pair("VERIFY_A_VIEWER_EMAIL", "VERIFY_A_VIEWER_PASSWORD", "a-viewer");
}

export function tenantBOwner() {
  return pair("VERIFY_B_OWNER_EMAIL", "VERIFY_B_OWNER_PASSWORD", "b-owner");
}

/** Demo owner is read-only for route checks; never mutate co_1. */
export function demoOwner() {
  return pair("DEMO_OWNER_EMAIL", "DEMO_OWNER_PASSWORD", "demo-owner");
}

export function insforgeBaseUrl() {
  return process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL ?? null;
}

export function anonKey() {
  return (
    process.env.INSFORGE_ANON_KEY ??
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ??
    null
  );
}

export function verifyRunId() {
  return process.env.VERIFY_RUN_ID ?? null;
}

export function mutationAllowed() {
  return process.env.VERIFY_ALLOW_MUTATION === "erp-backend-v1";
}

export async function signInAccessToken(email: string, password: string) {
  const baseUrl = insforgeBaseUrl();
  const key = anonKey();
  if (!baseUrl || !key) throw new Error("InsForge URL/anon key missing");
  const response = await fetch(`${baseUrl}/api/auth/sessions?client_type=mobile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`sign-in failed (${response.status}) for ${email}`);
  }
  const session = (await response.json()) as { accessToken?: string };
  if (!session.accessToken) throw new Error(`no accessToken for ${email}`);
  return { baseUrl, accessToken: session.accessToken, anonKey: key };
}
