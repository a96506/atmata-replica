"use client";

import * as React from "react";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { inviteUserAction } from "@/lib/actions/user-admin";
import { ASSIGNABLE_USER_ROLES } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions/result";
import type { InviteUserResult } from "../domain/types";

const empty: ActionResult<InviteUserResult> | null = null;

export function InviteUserDialog() {
  const t = useTranslations("settings.users");
  const locale = useLocale() as "en" | "ar";
  const tRoot = useTranslations();
  const [open, setOpen] = React.useState(false);
  const [requestId, setRequestId] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [roles, setRoles] = React.useState<string[]>(["viewer"]);

  const [state, action, pending] = useActionState(
    async (_prev: ActionResult<InviteUserResult> | null, formData: FormData) => {
      return inviteUserAction({
        locale,
        email: String(formData.get("email") ?? ""),
        roles,
        requestId,
      });
    },
    empty,
  );

  const success = state?.ok === true ? state.data : null;
  const errorKey =
    state && !state.ok
      ? (state.error.messageKey ?? "errors.internal")
      : "";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setRequestId(crypto.randomUUID());
      setCopied(false);
      setRoles(["viewer"]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>{t("invite.action")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("invite.title")}</DialogTitle>
          <DialogDescription>{t("invite.subtitle")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">{t("email")}</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              maxLength={320}
              autoComplete="email"
              disabled={pending || Boolean(success)}
            />
          </div>
          <fieldset className="grid gap-2" disabled={pending || Boolean(success)}>
            <legend className="text-sm font-medium">{t("rolesLabel")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ASSIGNABLE_USER_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={roles.includes(role)}
                    onCheckedChange={(checked) => {
                      setRoles((current) =>
                        checked === true
                          ? [...current, role]
                          : current.filter((value) => value !== role),
                      );
                    }}
                  />
                  <span>{t(`roles.${role}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {errorKey ? (
            <Alert variant="destructive">
              <AlertDescription>{tRoot(errorKey)}</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert>
              <AlertDescription>
                {success.emailDelivered ? t("invite.complete") : t("invite.emailFailed")}
                <span className="mt-2 block break-all font-mono text-xs" dir="ltr">
                  {success.invitationLink}
                </span>
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter className="gap-2">
            {success ? (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(success.invitationLink);
                  setCopied(true);
                }}
              >
                {copied ? t("invite.copied") : t("invite.copyLink")}
              </Button>
            ) : (
              <Button type="submit" disabled={pending || !requestId}>
                {pending ? t("invite.submitting") : t("invite.submit")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
