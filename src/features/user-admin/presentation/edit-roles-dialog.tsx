"use client";

import * as React from "react";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setMemberRolesAction } from "@/lib/actions/user-admin";
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
import type { ActionResult } from "@/lib/actions/result";
import type { CompanyMemberAdminDto, SetMemberRolesResult } from "../domain/types";
import { isLastActiveOwner } from "../domain/roles";

const empty: ActionResult<SetMemberRolesResult> | null = null;

export function EditRolesDialog({
  member,
  activeOwnerCount,
}: {
  member: CompanyMemberAdminDto;
  activeOwnerCount: number;
}) {
  const t = useTranslations("settings.users");
  const tRoot = useTranslations();
  const locale = useLocale() as "en" | "ar";
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [roles, setRoles] = React.useState<string[]>(member.roles.filter((role) => role !== "ai_agent"));
  const lastOwner = isLastActiveOwner(member, activeOwnerCount);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setRoles(member.roles.filter((role) => role !== "ai_agent"));
    }
    setOpen(next);
  };

  const [state, action, pending] = useActionState(
    async () =>
      setMemberRolesAction({
        locale,
        userId: member.userId,
        roles,
      }),
    empty,
  );

  React.useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
      if (state.data.lostAdmin) {
        router.replace("/settings");
      }
    }
  }, [state, router]);

  const errorKey = state && !state.ok ? state.error.messageKey : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("editRoles")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit.title")}</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <fieldset className="grid gap-2" disabled={pending}>
            <legend className="text-sm font-medium">{t("rolesLabel")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ASSIGNABLE_USER_ROLES.map((role) => {
                const lockedAdmin = lastOwner && role === "admin";
                return (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={roles.includes(role)}
                      disabled={lockedAdmin}
                      onCheckedChange={(checked) => {
                        if (lockedAdmin) return;
                        setRoles((current) =>
                          checked === true
                            ? [...current, role]
                            : current.filter((value) => value !== role),
                        );
                      }}
                    />
                    <span>{t(`roles.${role}`)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {lastOwner ? (
            <p className="text-muted-foreground text-xs">{t("lastOwnerHint")}</p>
          ) : null}
          {errorKey ? (
            <Alert variant="destructive">
              <AlertDescription>{tRoot(errorKey)}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t("edit.submitting") : t("edit.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
