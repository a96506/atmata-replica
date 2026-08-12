import { createAdminClient } from "@insforge/sdk";
import { cookies } from "next/headers";
import { createAuthActions, createServerClient } from "@insforge/sdk/ssr";

/** Server Components, Route Handlers, Server Actions — cookie session. */
export async function createInsForgeServerClient() {
  return createServerClient({
    cookies: await cookies(),
  });
}

/** Sign-in / sign-up / sign-out / OAuth — writes httpOnly refresh cookie. */
export async function createInsForgeAuthActions() {
  return createAuthActions({
    cookies: await cookies(),
  });
}

/**
 * Privileged server-only admin client (service role equivalent).
 * Never import this into Client Components.
 */
export function createInsForgeAdminClient() {
  const baseUrl = process.env.INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Missing INSFORGE_URL or INSFORGE_API_KEY");
  }
  return createAdminClient({ baseUrl, apiKey });
}
