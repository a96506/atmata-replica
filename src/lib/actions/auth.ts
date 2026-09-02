"use server";

import { createHash } from "node:crypto";
import {
  createInsForgeAdminClient,
  createInsForgeAuthActions,
  createInsForgeServerClient,
} from "@/lib/insforge/server";
import { getAppSession } from "@/lib/insforge/session";
import { checkRateLimit } from "@/lib/actions/rate-limit";

export type AuthActionResult = {
  ok: boolean;
  message?: string;
  /** Stable i18n key (under the root `errors` namespace) for client-side translation. */
  messageKey?: string;
};

function messageFrom(error: { message?: string } | null, fallback: string) {
  return error?.message?.trim() || fallback;
}

// Heuristic for the InsForge backend's IP-scoped reset-email throttle. The
// raw backend message ("Too many send email verification requests from this
// IP") is infra language and names the wrong flow — surface customer copy
// via the `errors.resetRateLimited` message key instead.
function isResetRateLimitError(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return /too many|rate.?limit|throttl/.test(msg);
}

// Mirror the InsForge password-reset throttle: IP-scoped, ~2 attempts per
// 15 min. Best-effort in-memory (see rate-limit.ts) — not durable across
// serverless instances. Tuned for brute-force slowing, not a hard cap.
const SIGN_IN_LIMIT = 5;
const SIGN_IN_WINDOW_MS = 15 * 60_000;

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    return { ok: false, message: "Email and password are required." };
  }

  const throttle = await checkRateLimit("signIn", SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS);
  if (!throttle.ok) {
    const minutes = Math.max(1, Math.ceil(throttle.retryAfterMs / 60_000));
    return {
      ok: false,
      message: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const auth = await createInsForgeAuthActions();
  const { data, error } = await auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error || !data?.user) {
    return {
      ok: false,
      message: messageFrom(error, "Unable to sign in."),
    };
  }

  const appSession = await getAppSession();
  if (!appSession.session) {
    const insforge = await createInsForgeServerClient();
    const { data: isAdmin } = await insforge.database.rpc("is_platform_admin");
    if (isAdmin === true) {
      return { ok: true };
    }
    await auth.signOut();
    const message =
      appSession.reason === "suspended"
        ? "This company is suspended."
        : "Your account is not assigned to a company.";
    return { ok: false, message };
  }

  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  const auth = await createInsForgeAuthActions();
  await auth.signOut();
}

export async function sendPasswordResetAction(input: {
  email: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) {
    return { ok: false, message: "Email is required." };
  }

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.auth.sendResetPasswordEmail({ email });

  if (error) {
    if (isResetRateLimitError(error)) {
      return { ok: false, messageKey: "errors.resetRateLimited" };
    }
    return {
      ok: false,
      message: messageFrom(error, "Unable to send the reset code."),
    };
  }

  return { ok: true };
}

export async function resetPasswordAction(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  if (!email || !code || input.newPassword.length < 6) {
    return {
      ok: false,
      message: "Enter your email, reset code, and a password of at least 6 characters.",
    };
  }

  const insforge = await createInsForgeServerClient();
  const { data: exchangeData, error: exchangeError } =
    await insforge.auth.exchangeResetPasswordToken({ email, code });

  if (exchangeError || !exchangeData?.token) {
    return {
      ok: false,
      message: messageFrom(exchangeError, "Invalid or expired reset code."),
    };
  }

  const { error } = await insforge.auth.resetPassword({
    newPassword: input.newPassword,
    otp: exchangeData.token,
  });

  if (error) {
    return {
      ok: false,
      message: messageFrom(error, "Unable to reset the password."),
    };
  }

  return { ok: true };
}

export type InvitationAcceptMode = "new" | "existing";

export type InvitationContext = {
  email: string;
  mode: InvitationAcceptMode;
};

export async function resolveInvitationEmail(token: string): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const admin = createInsForgeAdminClient();
  const tokenHash = createHash("sha256").update(trimmed).digest("hex");
  const { data, error } = await admin.database
    .from("invitations")
    .select("email, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const invitation = data as {
    email: string;
    status: string;
    expires_at: string;
  } | null;
  if (
    error ||
    !invitation ||
    invitation.status !== "pending" ||
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }
  return invitation.email.toLowerCase();
}

/**
 * Detect whether the invite email already exists in InsForge auth.users.
 * Admin list-users: GET /api/auth/users?search=…
 * @see https://docs.insforge.dev/api-reference/admin/list-all-users-admin-only
 */
async function authEmailExists(email: string): Promise<boolean> {
  const baseUrl = process.env.INSFORGE_URL?.replace(/\/$/, "");
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Missing INSFORGE_URL or INSFORGE_API_KEY");
  }

  const url = new URL("/api/auth/users", baseUrl);
  url.searchParams.set("search", email);
  url.searchParams.set("limit", "50");
  url.searchParams.set("offset", "0");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to look up invitation account (${response.status}).`);
  }

  const body = (await response.json()) as {
    data?: Array<{ email?: string | null }>;
  };
  const needle = email.trim().toLowerCase();
  return (body.data ?? []).some(
    (user) => (user.email ?? "").trim().toLowerCase() === needle,
  );
}

export async function resolveInvitationContext(
  token: string,
): Promise<InvitationContext | null> {
  const email = await resolveInvitationEmail(token);
  if (!email) return null;
  const exists = await authEmailExists(email);
  return { email, mode: exists ? "existing" : "new" };
}

export async function acceptInvitationAction(input: {
  token: string;
  fullName: string;
  password: string;
  mode: InvitationAcceptMode;
}): Promise<AuthActionResult> {
  const token = input.token.trim();
  const fullName = input.fullName.trim();
  const mode = input.mode === "existing" ? "existing" : "new";

  if (!token || !fullName || input.password.length < 6) {
    return {
      ok: false,
      messageKey: "auth.invitation.incompleteFields",
    };
  }

  const admin = createInsForgeAdminClient();
  const auth = await createInsForgeAuthActions();

  const email = await resolveInvitationEmail(token);
  if (!email) {
    return { ok: false, messageKey: "auth.invitation.invalidOrExpired" };
  }

  let userId: string | null = null;

  if (mode === "existing") {
    const { data: signInData, error: signInError } =
      await auth.signInWithPassword({
        email,
        password: input.password,
      });
    if (signInError || !signInData?.user) {
      return {
        ok: false,
        messageKey: "auth.invitation.wrongPassword",
      };
    }
    const signedEmail = signInData.user.email?.trim().toLowerCase() ?? "";
    if (signedEmail !== email) {
      await auth.signOut();
      return { ok: false, messageKey: "auth.invitation.invalidOrExpired" };
    }
    userId = signInData.user.id;
  } else {
    const { data: createData, error: createError } = await admin.auth.signUp({
      email,
      password: input.password,
      name: fullName,
      autoConfirm: true,
    });

    if (!createData?.user) {
      if (createError) {
        return {
          ok: false,
          messageKey: "auth.invitation.emailHasAccount",
        };
      }
      return {
        ok: false,
        messageKey: "auth.invitation.createFailed",
      };
    }
    userId = createData.user.id;
  }

  if (!userId) {
    return { ok: false, messageKey: "auth.invitation.acceptFailed" };
  }

  const { error: acceptError } = await admin.database.rpc(
    "accept_invitation",
    {
      p_token: token,
      p_user_id: userId,
      p_full_name: fullName,
    },
  );

  if (acceptError) {
    await auth.signOut();
    return {
      ok: false,
      messageKey: "auth.invitation.invalidOrExpired",
    };
  }

  if (mode === "new") {
    const { data: signInData, error: signInError } =
      await auth.signInWithPassword({
        email,
        password: input.password,
      });

    if (signInError || !signInData?.user) {
      return {
        ok: false,
        messageKey: "auth.invitation.createdSignIn",
      };
    }
  }

  return { ok: true };
}
