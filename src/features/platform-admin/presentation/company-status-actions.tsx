"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { setCompanyStatusAction, resendOwnerInvitationAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PlatformCompanyDetail } from "../domain/company";

export function CompanyStatusActions({
  company,
  locale,
}: {
  company: PlatformCompanyDetail;
  locale: "en" | "ar";
}) {
  const t = useTranslations("platformAdmin");
  const [pending, startTransition] = React.useTransition();
  const [reason, setReason] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [link, setLink] = React.useState("");

  function runStatus(status: "active" | "suspended") {
    startTransition(async () => {
      const result = await setCompanyStatusAction({
        companyId: company.id,
        status,
        expectedRowVersion: company.rowVersion,
        reason,
      });
      if (!result.ok) {
        setMessage(t("errors.generic"));
        return;
      }
      setOpen(false);
      setReason("");
      setMessage(t(status === "suspended" ? "status.suspendedDone" : "status.reactivated"));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {company.status === "active" ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">{t("status.suspend")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("status.suspendTitle")}</DialogTitle>
                <DialogDescription>{t("status.suspendHint")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="reason">{t("status.reason")}</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button
                  variant="destructive"
                  disabled={pending || reason.trim().length === 0}
                  onClick={() => runStatus("suspended")}
                >
                  {t("status.suspendConfirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button
            disabled={pending}
            onClick={() => runStatus("active")}
          >
            {t("status.reactivate")}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await resendOwnerInvitationAction({
                companyId: company.id,
                locale,
              });
              if (!result.ok) {
                setMessage(t("errors.generic"));
                return;
              }
              setLink(result.data.invitationLink ?? "");
              setMessage(
                result.data.emailDelivered
                  ? t("resend.complete")
                  : t("provision.emailFailed"),
              );
            });
          }}
        >
          {t("resend.action")}
        </Button>
      </div>
      {message ? (
        <Alert>
          <AlertDescription>
            {message}
            {link ? (
              <span className="mt-2 block break-all font-mono text-xs" dir="ltr">
                {link}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
