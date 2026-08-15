import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const { next, error, reset } = await searchParams;
  const t = await getTranslations("auth");
  const initialError =
    error === "no_company"
      ? t("noCompany")
      : error === "suspended"
        ? t("companySuspended")
        : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6">
      <LoginForm
        nextPath={next}
        initialError={initialError}
        initialSuccess={reset === "success" ? t("passwordResetSuccess") : undefined}
      />
    </main>
  );
}
