import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Playwright (and some browsers) hit 127.0.0.1 while `next dev` binds as
  // localhost — without this, Next 16 blocks /_next/* and client JS never
  // hydrates, so login forms fall through to native GET submits.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["127.0.0.1"],
  // Monorepo: avoid picking an unrelated parent lockfile as Turbopack root.
  turbopack: {
    root: process.cwd(),
  },
};

export default withNextIntl(nextConfig);
