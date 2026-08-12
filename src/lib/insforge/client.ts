import { createBrowserClient } from "@insforge/sdk/ssr";

/** Browser / Client Components — reads anon key + access-token cookie. */
export const insforge = createBrowserClient();
