import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
  // The URL locale prefix is authoritative. Disable cookie/Accept-Language
  // based redirection so a request to /en/... never gets bounced to /ar/...
  // (and vice-versa) by the NEXT_LOCALE cookie — the auth redirect then
  // reliably lands on the locale the user actually requested.
  localeDetection: false,
});
