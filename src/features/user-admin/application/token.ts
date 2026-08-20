import { createHash, createHmac } from "node:crypto";
import { KnownActionError } from "@/lib/actions/errors";

export function invitationTokenSecret(): string {
  const secret = process.env.INVITATION_TOKEN_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new KnownActionError("INTERNAL");
  }
  return secret;
}

export function deriveInvitationToken(input: {
  companyId: string;
  email: string;
  requestId: string;
  secret?: string;
}): string {
  const secret = input.secret ?? invitationTokenSecret();
  return createHmac("sha256", secret)
    .update(`${input.companyId}:${input.email}:${input.requestId}`)
    .digest("hex");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function appOrigin(): string {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!origin || !/^https?:\/\//i.test(origin)) {
    throw new KnownActionError("INTERNAL");
  }
  return origin;
}

export function invitationLink(token: string, locale: "en" | "ar"): string {
  return `${appOrigin()}/${locale}/invitation?token=${encodeURIComponent(token)}`;
}
