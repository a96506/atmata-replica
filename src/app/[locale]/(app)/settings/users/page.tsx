import { getTranslations } from "next-intl/server";
import { DocumentList } from "@/components/doc/DocumentList";
import { getAppSession } from "@/lib/insforge/session";
import { listUserAdminPage } from "@/features/user-admin/application/service";
import { UserAdminClient } from "@/features/user-admin/presentation/user-admin-client";

export default async function Page() {
  const t = await getTranslations("settings.users");
  const session = await getAppSession();
  if (!session.session?.roles.includes("admin")) {
    return (
      <DocumentList title={t("title")} subtitle={t("subtitle")}>
        <p className="text-muted-foreground text-sm">{t("forbidden")}</p>
      </DocumentList>
    );
  }

  const page = await listUserAdminPage();
  return <UserAdminClient page={page} />;
}
