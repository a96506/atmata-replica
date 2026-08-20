"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/components/doc/DocumentList";
import { useConfirm } from "@/components/confirm-dialog";
import { deactivateMemberAction } from "@/lib/actions/user-admin";
import type { UserAdminPageDto } from "../domain/types";
import { isLastActiveOwner } from "../domain/roles";
import { InviteUserDialog } from "./invite-user-dialog";
import { EditRolesDialog } from "./edit-roles-dialog";

export function UserAdminClient({ page }: { page: UserAdminPageDto }) {
  const t = useTranslations("settings.users");
  const locale = useLocale() as "en" | "ar";
  const router = useRouter();
  const confirm = useConfirm();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function onDeactivate(userId: string) {
    const ok = await confirm({
      title: t("deactivate.title"),
      description: t("deactivate.description"),
      confirmLabel: t("deactivate.confirm"),
      tone: "destructive",
    });
    if (!ok) return;
    setPendingId(userId);
    const result = await deactivateMemberAction({ locale, userId });
    setPendingId(null);
    if (result.ok) router.refresh();
  }

  return (
    <DocumentList
      title={t("title")}
      subtitle={t("subtitle")}
      primaryAction={<InviteUserDialog />}
    >
      <DataTable
        columns={[
          { key: "name", label: t("name") },
          { key: "email", label: t("email") },
          { key: "roles", label: t("rolesLabel") },
          { key: "active", label: t("active") },
          { key: "actions", label: t("actions"), sortable: false },
        ]}
        emptyMessage={t("noMembers")}
        rows={page.members.map((member) => {
          const lastOwner = isLastActiveOwner(member, page.activeOwnerCount);
          const self = member.userId === page.currentUserId;
          return [
            member.fullName,
            member.email,
            <span key={`${member.userId}-roles`} className="flex flex-wrap gap-1">
              {member.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {t(`roles.${role}`)}
                </Badge>
              ))}
            </span>,
            member.active ? t("yes") : t("no"),
            <span key={`${member.userId}-actions`} className="flex flex-wrap gap-2">
              <EditRolesDialog member={member} activeOwnerCount={page.activeOwnerCount} />
              <Button
                variant="outline"
                size="sm"
                disabled={self || lastOwner || !member.active || pendingId === member.userId}
                onClick={() => onDeactivate(member.userId)}
              >
                {t("deactivate.action")}
              </Button>
            </span>,
          ];
        })}
      />

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">{t("pendingTitle")}</h2>
        <DataTable
          columns={[
            { key: "email", label: t("email") },
            { key: "roles", label: t("rolesLabel") },
            { key: "expires", label: t("expires") },
          ]}
          emptyMessage={t("noInvitations")}
          rows={page.pendingInvitations.map((invite) => [
            invite.email,
            invite.roles.join(", "),
            new Date(invite.expiresAt).toLocaleString(locale),
          ])}
        />
      </div>
    </DocumentList>
  );
}
