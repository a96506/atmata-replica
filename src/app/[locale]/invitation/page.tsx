import { InvitationForm } from "./invitation-form";
import { resolveInvitationContext } from "@/lib/actions/auth";

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const context = token ? await resolveInvitationContext(token) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <InvitationForm
        token={context ? token : undefined}
        email={context?.email ?? ""}
        mode={context?.mode ?? "new"}
      />
    </main>
  );
}
