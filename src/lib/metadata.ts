import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Build a per-route `generateMetadata` that sets a localized page title.
 *
 * The root locale layout defines `title.template = "%s · Atmata"`, so each
 * route only needs to supply its own name; the brand suffix is appended
 * automatically.
 *
 * Usage in a page:
 *   export const generateMetadata = pageMetadata("dashboard", "title");
 */
export function pageMetadata(
  namespace: string,
  key: string = "title",
) {
  return async ({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }): Promise<Metadata> => {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace });
    return { title: t(key) };
  };
}
