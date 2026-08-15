"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { sendPasswordResetAction } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
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
        const email = String(form.get("email") ?? "");
        setError("");
        startTransition(async () => {
          const result = await sendPasswordResetAction({ email });
          if (!result.ok) {
            setError(result.message ?? t("genericError"));
            return;
          }
          router.push(`/reset-password?email=${encodeURIComponent(email)}`);
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
