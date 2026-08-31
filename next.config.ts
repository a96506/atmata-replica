import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  // CSP — no-nonce variant. Inline scripts/styles are still required by
  // next-intl + styled-jsx, so 'unsafe-inline' is retained for those
  // directives. See https://nextjs.org/docs/app/guides/content-security-policy
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://yfmw4i43.eu-central.insforge.app https://cdn.insforge.dev",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Standalone output: produces a self-contained `.next/standalone` server
  // for the Railway Docker image. No node_modules at runtime.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: "standalone",
  // Playwright (and some browsers) hit 127.0.0.1 while `next dev` binds as
  // localhost — without this, Next 16 blocks /_next/* and client JS never
  // hydrates, so login forms fall through to native GET submits.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["127.0.0.1"],
  // Monorepo: avoid picking an unrelated parent lockfile as Turbopack root.
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
