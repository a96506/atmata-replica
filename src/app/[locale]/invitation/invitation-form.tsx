"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  acceptInvitationAction,
  sendInvitationOtpAction,
  type InvitationAcceptMode,
} from "@/lib/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ExistingStep = "send" | "verify";

function invitationErrorMessage(
  result: { messageKey?: string; message?: string },
  tInv: ReturnType<typeof useTranslations<"auth.invitation">>,
  fallback: string,
): string {
  const key = result.messageKey?.startsWith("auth.invitation.")
    ? result.messageKey.slice("auth.invitation.".length)
    : null;
  if (key) {
    return tInv(key as Parameters<typeof tInv>[0]);
  }
  return result.message ?? fallback;
}

export function InvitationForm({
  token,
  email,
  mode: initialMode,
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
  const [info, setInfo] = React.useState("");
  const [otpStep, setOtpStep] = React.useState<ExistingStep>("send");
  const [mode, setMode] = React.useState<InvitationAcceptMode>(initialMode);
  const isExisting = mode === "existing";

  function isEmailHasAccountResult(result: {
    messageKey?: string;
    message?: string;
  }): boolean {
    return (
      result.messageKey === "auth.invitation.emailHasAccount" ||
      result.messageKey === "emailHasAccount"
    );
  }

  function switchToExistingOtpMode(message?: string) {
    setMode("existing");
    setOtpStep("send");
    setError("");
    setInfo(message ?? tInv("emailHasAccount"));
  }

  if (isExisting) {
    return (
      <form
        method="post"
        className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          if (!token) return;
          setError("");
          setInfo("");

          if (otpStep === "send") {
            startTransition(async () => {
              const result = await sendInvitationOtpAction({ token });
              if (!result.ok) {
                setError(
                  invitationErrorMessage(result, tInv, tInv("otpSendFailed")),
                );
                return;
              }
              setOtpStep("verify");
              setInfo(tInv("codeSent"));
            });
            return;
          }

          const form = new FormData(event.currentTarget);
          const otp = String(form.get("otp") ?? "").trim();
          startTransition(async () => {
            const result = await acceptInvitationAction({
              token,
              otp,
              mode: "existing",
            });
            if (!result.ok) {
              setError(
                invitationErrorMessage(result, tInv, tInv("otpFailed")),
              );
              return;
            }
            router.replace("/");
            router.refresh();
          });
        }}
      >
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">{tInv("titleExisting")}</h1>
          <p className="text-sm text-muted-foreground">
            {tInv("subtitleExisting")}
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {info && !error ? (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        ) : null}

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

        {otpStep === "verify" ? (
          <div className="space-y-2">
            <Label htmlFor="otp">{tInv("codeLabel")}</Label>
            <Input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder={tInv("enterCode")}
              required
              autoFocus
              disabled={!token || pending}
            />
          </div>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={pending || !token || !email}
        >
          {otpStep === "send"
            ? pending
              ? tInv("sendingCode")
              : tInv("sendCode")
            : pending
              ? tInv("verifying")
              : tInv("verifyAndAccept")}
        </Button>

        {otpStep === "verify" ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={pending || !token}
            onClick={() => {
              if (!token) return;
              setError("");
              setInfo("");
              startTransition(async () => {
                const result = await sendInvitationOtpAction({ token });
                if (!result.ok) {
                  setError(
                    invitationErrorMessage(
                      result,
                      tInv,
                      tInv("otpSendFailed"),
                    ),
                  );
                  return;
                }
                setInfo(tInv("codeSent"));
              });
            }}
          >
            {tInv("resendCode")}
          </Button>
        ) : null}

        <Link
          href="/login"
          className="block text-center text-sm text-primary hover:underline"
        >
          {t("backToSignIn")}
        </Link>
      </form>
    );
  }

  return (
    <form
      method="post"
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
            fullName: String(form.get("fullName") ?? ""),
            password,
            mode: "new",
          });
          if (!result.ok) {
            if (isEmailHasAccountResult(result)) {
              switchToExistingOtpMode(
                invitationErrorMessage(result, tInv, tInv("emailHasAccount")),
              );
              return;
            }
            setError(invitationErrorMessage(result, tInv, tInv("invalid")));
            return;
          }
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{tInv("titleNew")}</h1>
        <p className="text-sm text-muted-foreground">{tInv("subtitleNew")}</p>
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
        <Label htmlFor="password">{tInv("newPassword")}</Label>
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

      <Button type="submit" className="w-full" disabled={pending || !token || !email}>
        {pending ? tInv("creatingAccount") : tInv("createAccount")}
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
