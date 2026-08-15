import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);
const PUBLIC_ROUTES = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/invitation",
]);

export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  const { accessToken } = await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const localeMatch = request.nextUrl.pathname.match(/^\/(en|ar)(\/.*)?$/);
  if (!localeMatch) {
    return response;
  }

  const locale = localeMatch[1];
  const localePath = localeMatch[2] || "/";
  if (!accessToken && !PUBLIC_ROUTES.has(localePath)) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set(
      "next",
      `${localePath}${request.nextUrl.search}`,
    );
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/", "/(ar|en)/:path*"],
};
