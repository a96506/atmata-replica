"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { resetPasswordAction } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESET_EMAIL_STORAGE_KEY = "atmata.resetPasswordEmail";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState("");

  // Prefill from per-tab sessionStorage (written by the forgot-password
  // form) — never from the URL, so the email isn't leaked via history/logs.
  const [initialEmail, setInitialEmail] = React.useState("");
  React.useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(RESET_EMAIL_STORAGE_KEY);
      if (stored) setInitialEmail(stored);
    } catch {
      /* sessionStorage unavailable — leave blank */
    }
  }, []);

  return (
    <form
      className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const newPassword = String(form.get("newPassword") ?? "");
        const confirmPassword = String(form.get("confirmPassword") ?? "");
        if (newPassword !== confirmPassword) {
          setError(t("passwordMismatch"));
          return;
        }
        setError("");
        startTransition(async () => {
          const result = await resetPasswordAction({
            email: String(form.get("email") ?? ""),
            code: String(form.get("code") ?? ""),
            newPassword,
          });
          if (!result.ok) {
            setError(
              result.messageKey
                ? tErrors(result.messageKey.replace(/^errors\./, ""))
                : (result.message ?? t("genericError")),
            );
            return;
          }
          try {
            window.sessionStorage.removeItem(RESET_EMAIL_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          router.replace("/login?reset=success");
        });
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{t("resetTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("resetSubtitle")}</p>
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
          defaultValue={initialEmail}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="code">{t("resetCode")}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          minLength={6}
          maxLength={6}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("newPassword")}</Label>
        <Input
          id="newPassword"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
        <Input
          id="confirmPassword"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("resettingPassword") : t("resetPassword")}
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
