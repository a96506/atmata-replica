import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <ResetPasswordForm />
    </main>
  );
}
