import { InvitationForm } from "./invitation-form";
import { resolveInvitationEmail } from "@/lib/actions/auth";

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const email = token ? await resolveInvitationEmail(token) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <InvitationForm token={email ? token : undefined} email={email ?? ""} />
    </main>
  );
}
