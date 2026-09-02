/**
 * Absolute app origin for invitation / email links.
 * Prefer explicit APP_URL / NEXT_PUBLIC_APP_URL when non-localhost.
 * On Railway, fall back to the public domain so deploy links are not stuck on
 * localhost ([Railway variables](https://docs.railway.com/reference/variables):
 * `RAILWAY_PUBLIC_DOMAIN`). Optional `RAILWAY_STATIC_URL` if set.
 */
export function resolveAppOrigin(): string | null {
  const explicit = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");

  const railwayHostOrUrl = (
    process.env.RAILWAY_PUBLIC_DOMAIN ??
    process.env.RAILWAY_STATIC_URL ??
    ""
  ).trim();
  const onRailway = Boolean(railwayHostOrUrl);
  const explicitIsLocalhost =
    !explicit || /localhost|127\.0\.0\.1/i.test(explicit);

  if (explicit && !(onRailway && explicitIsLocalhost)) {
    if (!/^https?:\/\//i.test(explicit)) return null;
    return explicit;
  }

  if (railwayHostOrUrl) {
    if (/^https?:\/\//i.test(railwayHostOrUrl)) {
      return railwayHostOrUrl.replace(/\/$/, "");
    }
    return `https://${railwayHostOrUrl.replace(/\/$/, "")}`;
  }

  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit;
  }

  // Local default when no explicit / Railway URL is configured.
  return "http://localhost:3000";
}
