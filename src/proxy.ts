import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  return response;
}

export const config = {
  matcher: ["/", "/(ar|en)/:path*"],
};
