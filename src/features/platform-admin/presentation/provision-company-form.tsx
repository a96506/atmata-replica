"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { provisionCompanyAction } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProvisionCompanyForm() {
  const t = useTranslations("platformAdmin");
  const locale = useLocale() as "en" | "ar";
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState("");
  const [link, setLink] = React.useState("");
  const [emailDelivered, setEmailDelivered] = React.useState<boolean | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("provision.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-lg gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setError("");
            startTransition(async () => {
              const result = await provisionCompanyAction({
                name: String(form.get("name") ?? ""),
                ownerName: String(form.get("ownerName") ?? ""),
                ownerEmail: String(form.get("ownerEmail") ?? ""),
                locale,
              });
              if (!result.ok) {
                const key =
                  result.error.code === "CONFLICT"
                    ? "errors.CONFLICT"
                    : result.error.code === "VALIDATION"
                      ? "errors.VALIDATION"
                      : result.error.code === "FORBIDDEN"
                        ? "errors.FORBIDDEN"
                        : result.error.code === "STALE_VERSION"
                          ? "errors.STALE_VERSION"
                          : "errors.generic";
                setError(t(key));
                return;
              }
              setEmailDelivered(result.data.emailDelivered);
              setLink(result.data.invitationLink ?? "");
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="name">{t("provision.companyName")}</Label>
            <Input id="name" name="name" required maxLength={160} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ownerName">{t("provision.ownerName")}</Label>
            <Input id="ownerName" name="ownerName" required maxLength={160} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ownerEmail">{t("provision.ownerEmail")}</Label>
            <Input id="ownerEmail" name="ownerEmail" type="email" required maxLength={320} />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {link ? (
            <Alert>
              <AlertDescription>
                {emailDelivered
                  ? t("provision.complete")
                  : t("provision.emailFailed")}
                <span className="mt-2 block break-all font-mono text-xs" dir="ltr">
                  {link}
                </span>
              </AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? t("provision.submitting") : t("provision.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
