"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { resetPasswordAction } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ initialEmail }: { initialEmail?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState("");

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
            setError(result.message ?? t("genericError"));
            return;
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
