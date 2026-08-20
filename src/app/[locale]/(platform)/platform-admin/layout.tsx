import { notFound, redirect } from "next/navigation";
import { PlatformShell } from "@/components/app/PlatformShell";
import { getPlatformAdminGate } from "@/lib/insforge/session";

export default async function PlatformAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const gate = await getPlatformAdminGate();
  if (gate.reason === "unauthenticated") {
    redirect(`/${locale}/login?next=/${locale}/platform-admin`);
  }
  if (gate.reason === "not_platform_admin" || !gate.user) {
    notFound();
  }

  return <PlatformShell userEmail={gate.user.email}>{children}</PlatformShell>;
}
