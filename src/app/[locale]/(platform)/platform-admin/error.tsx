"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function PlatformAdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("platformAdmin");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{t("errors.generic")}</p>
      <Button type="button" variant="outline" onClick={reset}>
        {t("errors.retry")}
      </Button>
    </div>
  );
}
