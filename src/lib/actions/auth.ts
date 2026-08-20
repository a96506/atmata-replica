"use server";

import { createHash } from "node:crypto";
import {
  createInsForgeAdminClient,
  createInsForgeAuthActions,
  createInsForgeServerClient,
} from "@/lib/insforge/server";
import { getAppSession } from "@/lib/insforge/session";

export type AuthActionResult = {
  ok: boolean;
  message?: string;
};

function messageFrom(error: { message?: string } | null, fallback: string) {
  return error?.message?.trim() || fallback;
}

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    return { ok: false, message: "Email and password are required." };
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

export async function acceptInvitationAction(input: {
  token: string;
  fullName: string;
  password: string;
}): Promise<AuthActionResult> {
  const token = input.token.trim();
  const fullName = input.fullName.trim();

  if (!token || !fullName || input.password.length < 6) {
    return {
      ok: false,
      message: "Complete every field and use a password of at least 6 characters.",
    };
  }

  const admin = createInsForgeAdminClient();
  const auth = await createInsForgeAuthActions();
  let userId: string | null = null;

  const email = await resolveInvitationEmail(token);
  if (!email) {
    return { ok: false, message: "Invalid or expired invitation." };
  }

  const { data: createData, error: createError } = await admin.auth.signUp({
    email,
    password: input.password,
    name: fullName,
    autoConfirm: true,
  });

  if (createData?.user) {
    userId = createData.user.id;
  } else if (createError) {
    const { data: signInData, error: signInError } =
      await auth.signInWithPassword({
        email,
        password: input.password,
      });
    if (signInError || !signInData?.user) {
      return {
        ok: false,
        message: "This email already has an account. Enter its current password.",
      };
    }
    const signedEmail = signInData.user.email?.trim().toLowerCase() ?? "";
    if (signedEmail !== email) {
      await auth.signOut();
      return { ok: false, message: "Invalid or expired invitation." };
    }
    userId = signInData.user.id;
  }

  if (!userId) {
    return {
      ok: false,
      message: messageFrom(createError, "Unable to create the account."),
    };
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
      message: messageFrom(acceptError, "Invalid or expired invitation."),
    };
  }

  const { data: signInData, error: signInError } =
    await auth.signInWithPassword({
      email,
      password: input.password,
    });

  if (signInError || !signInData?.user) {
    return {
      ok: false,
      message: messageFrom(signInError, "Account created. Sign in to continue."),
    };
  }

  return { ok: true };
}
