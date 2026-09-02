"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  acceptInvitationAction,
  type InvitationAcceptMode,
} from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESET_EMAIL_STORAGE_KEY = "atmata.resetPasswordEmail";

export function InvitationForm({
  token,
  email,
  mode,
}: {
  token?: string;
  email: string;
  mode: InvitationAcceptMode;
}) {
  const t = useTranslations("auth");
  const tInv = useTranslations("auth.invitation");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(
    token && email ? "" : tInv("invalid"),
  );
  const isExisting = mode === "existing";

  return (
    <form
      method="post"
      className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
        if (!token) return;
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        if (!isExisting) {
          const confirmPassword = String(form.get("confirmPassword") ?? "");
          if (password !== confirmPassword) {
            setError(t("passwordMismatch"));
            return;
          }
        }
        setError("");
        startTransition(async () => {
          const result = await acceptInvitationAction({
            token,
            fullName: String(form.get("fullName") ?? ""),
            password,
            mode,
          });
          if (!result.ok) {
            const key = result.messageKey?.startsWith("auth.invitation.")
              ? result.messageKey.slice("auth.invitation.".length)
              : null;
            if (key) {
              setError(tInv(key as Parameters<typeof tInv>[0]));
            } else {
              setError(result.message ?? tInv("invalid"));
            }
            return;
          }
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">
          {isExisting ? tInv("titleExisting") : tInv("titleNew")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isExisting ? tInv("subtitleExisting") : tInv("subtitleNew")}
        </p>
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
          value={email}
          readOnly
          required
          disabled={!token}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password">
            {isExisting ? tInv("currentPassword") : tInv("newPassword")}
          </Label>
          {isExisting ? (
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                try {
                  window.sessionStorage.setItem(RESET_EMAIL_STORAGE_KEY, email);
                } catch {
                  /* ignore */
                }
              }}
            >
              {t("forgotPassword")}
            </Link>
          ) : null}
        </div>
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete={isExisting ? "current-password" : "new-password"}
          minLength={6}
          required
          disabled={!token}
        />
      </div>

      {!isExisting ? (
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{tInv("confirmPassword")}</Label>
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
      ) : null}

      <Button type="submit" className="w-full" disabled={pending || !token || !email}>
        {pending
          ? isExisting
            ? tInv("signingInAndAccepting")
            : tInv("creatingAccount")
          : isExisting
            ? tInv("signInAndAccept")
            : tInv("createAccount")}
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
