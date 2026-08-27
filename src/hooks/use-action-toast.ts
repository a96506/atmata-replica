"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/components/toast";
import type { ActionErrorCode } from "@/lib/actions/result";

type ActionError = {
  code: ActionErrorCode;
  messageKey: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Localize server-action errors at the toast call site.
 *
 * Server actions return `{ ok: false, error: { messageKey: "errors.<code>" } }`.
 * Toasting `error.messageKey` raw shows the i18n key to the user (F-040/F-031/F-054).
 * This hook resolves the key through `next-intl` before toasting, and exposes a
 * `network()` helper for thrown rejections that never produced an action result
 * (F-047 — silent save failure on transport loss).
 */
export function useActionToast() {
  const t = useTranslations();

  const resolve = (key: string): string => {
    try {
      return t.has(key) ? t(key) : t("errors.internal");
    } catch {
      return t("errors.internal");
    }
  };

  return {
    /** Localize a server action error and toast it. */
    error: (error: ActionError) => toast.error(resolve(error.messageKey)),
    /** Toast for a thrown network/transport failure (no action result returned). */
    network: () => toast.error(resolve("errors.unavailable")),
    /** Resolve the localized message without toasting. */
    message: (error: ActionError) => resolve(error.messageKey),
    /** Passthroughs. */
    success: (msg: string) => toast.success(msg),
    errorRaw: (msg: string) => toast.error(msg),
    resolve,
  };
}
