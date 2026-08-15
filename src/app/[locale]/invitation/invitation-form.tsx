"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { acceptInvitationAction } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvitationForm({
  token,
  initialEmail,
}: {
  token?: string;
  initialEmail?: string;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(token ? "" : t("invalidInvitation"));

  return (
    <form
      className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        if (!token) return;
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        const confirmPassword = String(form.get("confirmPassword") ?? "");
        if (password !== confirmPassword) {
          setError(t("passwordMismatch"));
          return;
        }
        setError("");
        startTransition(async () => {
          const result = await acceptInvitationAction({
            token,
            email: String(form.get("email") ?? ""),
            fullName: String(form.get("fullName") ?? ""),
            password,
          });
          if (!result.ok) {
            setError(result.message ?? t("invalidInvitation"));
            return;
          }
          router.replace("/inbox");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{t("invitationTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("invitationSubtitle")}</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="fullName">{t("fullName")}</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          autoFocus
          disabled={!token}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          defaultValue={initialEmail}
          required
          disabled={!token}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={6}
          required
          disabled={!token}
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
          disabled={!token}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending || !token}>
        {pending ? t("acceptingInvitation") : t("acceptInvitation")}
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
