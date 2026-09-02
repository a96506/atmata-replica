import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/insforge/session";
import { landingPathForRoles } from "@/lib/roles/landing";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { session } = await getAppSession();
  const landing = session ? landingPathForRoles(session.roles) : "/inbox";
  redirect(`/${locale}${landing}`);
}
