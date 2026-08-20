"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { signInAction } from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeNextPath(nextPath?: string) {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) return "/inbox";
  const withoutLocale = nextPath.replace(/^\/(en|ar)(?=\/|$)/, "");
  return withoutLocale.length > 0 ? withoutLocale : "/inbox";
}

export function LoginForm({
  nextPath,
  initialError,
  initialSuccess,
}: {
  nextPath?: string;
  initialError?: string;
  initialSuccess?: string;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(initialError ?? "");

  return (
    <form
      method="post"
      className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError("");
        startTransition(async () => {
          const result = await signInAction({
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          });
          if (!result.ok) {
            setError(result.message ?? t("genericError"));
            return;
          }
          router.replace(safeNextPath(nextPath));
          router.refresh();
        });
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-primary">Atmata</h1>
        <p className="text-sm font-medium text-foreground">{t("signInTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("signInSubtitle")}</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!error && initialSuccess ? (
        <Alert>
          <AlertDescription>{initialSuccess}</AlertDescription>
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password">{t("password")}</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-primary hover:underline"
          >
            {t("forgotPassword")}
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
