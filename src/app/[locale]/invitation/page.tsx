import { InvitationForm } from "./invitation-form";

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <InvitationForm token={token} initialEmail={email} />
    </main>
  );
}
