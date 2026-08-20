"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function PlatformSignOut({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await signOutAction();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut data-icon="inline-start" />
      {label}
    </Button>
  );
}
