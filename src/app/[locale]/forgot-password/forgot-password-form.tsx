"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { sendPasswordResetAction } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Per-tab stash for the email so the reset form can prefill it WITHOUT
// leaking the address through the URL query string (history, server logs,
// Referer). sessionStorage is scoped to this tab and never sent in requests.
const RESET_EMAIL_STORAGE_KEY = "atmata.resetPasswordEmail";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState("");

  return (
    <form
      className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const email = String(form.get("email") ?? "");
        setError("");
        startTransition(async () => {
          const result = await sendPasswordResetAction({ email });
          if (!result.ok) {
            setError(
              result.messageKey
                ? tErrors(result.messageKey.replace(/^errors\./, ""))
                : (result.message ?? t("genericError")),
            );
            return;
          }
          try {
            window.sessionStorage.setItem(RESET_EMAIL_STORAGE_KEY, email);
          } catch {
            /* sessionStorage unavailable — reset form just won't prefill */
          }
          router.push(`/reset-password`);
        });
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{t("forgotTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("forgotSubtitle")}</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("sendingCode") : t("sendCode")}
      </Button>

      <Link
        href="/login"
        className="block text-center text-sm text-primary hover:underline"
      >
        {t("backToSignIn")}
      </Link>
    </form>
  );
}
