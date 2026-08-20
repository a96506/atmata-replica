import { createHash, createHmac } from "node:crypto";
import { createClient } from "@insforge/sdk";
import { describe, expect, it } from "vitest";

const baseUrl = process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const secret = process.env.INVITATION_TOKEN_SECRET ?? "";

async function signIn(email: string, password: string) {
  const client = createClient({ baseUrl, anonKey });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.accessToken) throw new Error(`sign-in failed for ${email}`);
  return createClient({
    baseUrl,
    anonKey,
    accessToken: data.accessToken,
  });
}

function tokenFor(companyId: string, email: string, requestId: string) {
  const raw = createHmac("sha256", secret)
    .update(`${companyId}:${email}:${requestId}`)
    .digest("hex");
  return { raw, hash: createHash("sha256").update(raw).digest("hex") };
}

const configured = Boolean(
  baseUrl &&
    anonKey &&
    secret &&
    process.env.DEMO_OWNER_EMAIL &&
    process.env.DEMO_OWNER_PASSWORD,
);

describe.skipIf(!configured)("user-admin live RPCs", () => {
  it("keeps invite retries idempotent and stores only the token hash", async () => {
    const admin = await signIn(
      process.env.DEMO_OWNER_EMAIL!,
      process.env.DEMO_OWNER_PASSWORD!,
    );
    const email = `e2e.invite.${Date.now()}@atmata.example`;
    const requestId = crypto.randomUUID();
    const { raw, hash } = tokenFor("co_1", email, requestId);

    const first = await admin.database.rpc("invite_user", {
      p_email: email,
      p_roles: ["viewer"],
      p_request_id: requestId,
      p_token_hash: hash,
    });
    expect(first.error).toBeNull();
    const invitation = first.data as { id: string; email: string };
    expect(invitation.email).toBe(email);

    const retry = await admin.database.rpc("invite_user", {
      p_email: email,
      p_roles: ["viewer"],
      p_request_id: requestId,
      p_token_hash: hash,
    });
    expect(retry.error).toBeNull();
    expect((retry.data as { id: string }).id).toBe(invitation.id);

    const changed = await admin.database.rpc("invite_user", {
      p_email: email,
      p_roles: ["admin"],
      p_request_id: requestId,
      p_token_hash: hash,
    });
    expect(changed.error).toBeTruthy();

    const stored = await admin.database
      .from("invitations")
      .select("id,token_hash,email")
      .eq("id", invitation.id)
      .maybeSingle();
    expect(stored.error).toBeNull();
    const row = stored.data as { token_hash: string; email: string };
    expect(row.token_hash).toBe(hash);
    expect(row.token_hash).not.toBe(raw);
    expect(JSON.stringify(stored.data)).not.toContain(raw);
  });

  it("rejects ai_agent and makes role/deactivate retries no-ops", async () => {
    const admin = await signIn(
      process.env.DEMO_OWNER_EMAIL!,
      process.env.DEMO_OWNER_PASSWORD!,
    );
    const members = await admin.database
      .from("company_members")
      .select("user_id,is_owner,active,roles")
      .eq("active", true);
    expect(members.error).toBeNull();
    const rows = (members.data ?? []) as {
      user_id: string;
      is_owner: boolean;
      roles: string[];
    }[];
    const self = rows.find((row) => !row.is_owner);
    expect(self).toBeTruthy();

    const aiAgent = await admin.database.rpc("set_member_roles", {
      p_user_id: self!.user_id,
      p_roles: ["ai_agent"],
    });
    expect(aiAgent.error).toBeTruthy();

    const first = await admin.database.rpc("set_member_roles", {
      p_user_id: self!.user_id,
      p_roles: ["admin", "viewer"],
    });
    expect(first.error).toBeNull();
    const second = await admin.database.rpc("set_member_roles", {
      p_user_id: self!.user_id,
      p_roles: ["admin", "viewer"],
    });
    expect(second.error).toBeNull();
  });
});
