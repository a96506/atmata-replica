/**
 * Absolute app origin for invitation / email links.
 * Prefer explicit APP_URL / NEXT_PUBLIC_APP_URL when non-localhost.
 * On Vercel, fall back to system URLs so deploy links are not stuck on localhost
 * (https://vercel.com/docs/environment-variables/system-environment-variables).
 */
export function resolveAppOrigin(): string | null {
  const explicit = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");

  const vercelEnv = process.env.VERCEL_ENV;
  const onVercel = Boolean(vercelEnv);
  const explicitIsLocalhost =
    !explicit || /localhost|127\.0\.0\.1/i.test(explicit);

  if (explicit && !(onVercel && explicitIsLocalhost)) {
    if (!/^https?:\/\//i.test(explicit)) return null;
    return explicit;
  }

  if (vercelEnv === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit;
  }
  return null;
}
