/**
 * Provision dedicated VERIFY_A / VERIFY_B tenants for Playwright isolation.
 *
 * Pattern (multi-tenant Playwright): separate tenant credentials + per-tenant
 * storageState — never share the platform dual-hat as Tenant B.
 * @see https://scanlyapp.com/blog/e2e-testing-multi-tenant-saas-applications
 * @see https://currents.dev/posts/testing-authentication-with-playwright-the-complete-guide
 * @see https://www.shiplight.ai/blog/saas-e2e-testing
 *
 * Flow: platform_provision_company → admin signUp + accept_invitation →
 * owner invite_user (viewer) → accept. Does not mutate co_1.
 *
 * Usage:
 *   node --env-file=.env.local scripts/bootstrap-verify-tenants.mjs
 *   node --env-file=.env.local scripts/bootstrap-verify-tenants.mjs --dry-run
 *   node --env-file=.env.local scripts/bootstrap-verify-tenants.mjs --no-write-env
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createAdminClient, createClient } from "@insforge/sdk";

const PARENT_HOST = "https://yfmw4i43.eu-central.insforge.app";
const DEMO_COMPANY_ID = "co_1";
const BANNED_B_EMAILS = new Set(["alfailakawi1000@gmail.com"]);

const DEFAULTS = {
  VERIFY_A_OWNER_EMAIL: "verify.a.owner@atmata.example",
  VERIFY_A_OWNER_NAME: "Verify A Owner",
  VERIFY_A_VIEWER_EMAIL: "verify.a.viewer@atmata.example",
  VERIFY_A_VIEWER_NAME: "Verify A Viewer",
  VERIFY_B_OWNER_EMAIL: "verify.b.owner@atmata.example",
  VERIFY_B_OWNER_NAME: "Verify B Owner",
  VERIFY_A_COMPANY_NAME: "VF Tenant A",
  VERIFY_B_COMPANY_NAME: "VF Tenant B",
};

const ENV_KEYS = [
  "VERIFY_A_OWNER_EMAIL",
  "VERIFY_A_OWNER_PASSWORD",
  "VERIFY_A_VIEWER_EMAIL",
  "VERIFY_A_VIEWER_PASSWORD",
  "VERIFY_B_OWNER_EMAIL",
  "VERIFY_B_OWNER_PASSWORD",
  "VERIFY_ALLOW_MUTATION",
  "VERIFY_RUN_ID",
];

const PROJECT_FILE = fileURLToPath(
  new URL("../.insforge/project.json", import.meta.url),
);
const ENV_LOCAL = fileURLToPath(new URL("../.env.local", import.meta.url));

class BootstrapError extends Error {}

function abort(message) {
  throw new BootstrapError(message);
}

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function canonicalOrigin(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    abort("Invalid InsForge URL.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    abort(
      "INSFORGE_URL must be an origin only (no path, query, fragment, or credentials).",
    );
  }
  return url.origin;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) abort(`Missing required environment variable: ${name}.`);
  return value;
}

function optionalEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function generatePassword() {
  return randomBytes(18).toString("base64url");
}

function generateRunId() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `vf_${day}_${randomBytes(3).toString("hex")}`;
}

/** Deterministic UUID for provision idempotency (same email → same operation). */
function stableOperationId(seed) {
  const h = createHash("sha256").update(`verify-tenant:${seed}`).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = Buffer.from(h.subarray(0, 16)).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function invitationTokenPair(companyId, email, requestId, secret) {
  const raw = createHmac("sha256", secret)
    .update(`${companyId}:${email}:${requestId}`)
    .digest("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

async function readLinkedHost() {
  try {
    const project = JSON.parse(await readFile(PROJECT_FILE, "utf8"));
    if (typeof project.oss_host !== "string" || !project.oss_host.trim()) {
      abort("Linked InsForge project is missing oss_host.");
    }
    return normalizeUrl(project.oss_host);
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    abort("Unable to read the linked InsForge project.");
  }
}

async function adminGet(baseUrl, apiKey, path, failureMessage) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    abort(failureMessage);
  }
  if (!response.ok) abort(failureMessage);
  try {
    return await response.json();
  } catch {
    abort(failureMessage);
  }
}

async function findExactUsers(baseUrl, apiKey, email) {
  const payload = await adminGet(
    baseUrl,
    apiKey,
    `/api/auth/users?search=${encodeURIComponent(email)}&limit=50`,
    `Unable to look up auth user ${email}.`,
  );
  if (!Array.isArray(payload?.data)) abort(`Unable to look up auth user ${email}.`);
  const exact = payload.data.filter(
    (user) =>
      typeof user?.email === "string" && normalizeEmail(user.email) === email,
  );
  if (exact.length > 1) {
    abort(`Multiple auth users match ${email}.`);
  }
  return exact;
}

async function upsertEnvLocal(pairs) {
  let existing = "";
  try {
    existing = await readFile(ENV_LOCAL, "utf8");
  } catch {
    existing = "";
  }
  const lines = existing.length ? existing.split(/\r?\n/) : [];
  const keys = new Set(Object.keys(pairs));
  const next = [];
  const seen = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      next.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq);
    if (keys.has(key)) {
      next.push(`${key}=${pairs[key]}`);
      seen.add(key);
    } else {
      next.push(line);
    }
  }
  for (const key of ENV_KEYS) {
    if (keys.has(key) && !seen.has(key)) {
      next.push(`${key}=${pairs[key]}`);
    }
  }
  const body = `${next.join("\n").replace(/\n+$/, "")}\n`;
  await writeFile(ENV_LOCAL, body, "utf8");
}

async function signInAs(baseUrl, anonKey, email, password) {
  const client = createClient({ baseUrl, anonKey });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.accessToken) return null;
  return createClient({
    baseUrl,
    anonKey,
    accessToken: data.accessToken,
  });
}

async function getMembership(admin, userId) {
  const { data, error } = await admin.database
    .from("company_members")
    .select("company_id,is_owner,active,roles")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) abort(`Unable to read membership for ${userId}.`);
  return data;
}

async function ensureAuthUser(admin, baseUrl, apiKey, email, password, name, dryRun) {
  let exact = await findExactUsers(baseUrl, apiKey, email);
  let user = exact[0] ?? null;
  if (user) {
    return { user, created: false };
  }
  if (dryRun) {
    console.log(`Would create auth user: ${email}`);
    return { user: null, created: true };
  }
  const { data, error } = await admin.auth.signUp({
    email,
    password,
    name,
    autoConfirm: true,
  });
  if (!error && data?.user) {
    return { user: data.user, created: true };
  }
  exact = await findExactUsers(baseUrl, apiKey, email);
  user = exact[0] ?? null;
  if (!user) abort(`Unable to create auth user ${email}.`);
  return { user, created: false };
}

async function acceptInvitation(admin, token, userId, fullName) {
  const { error } = await admin.database.rpc("accept_invitation", {
    p_token: token,
    p_user_id: userId,
    p_full_name: fullName,
  });
  if (error) {
    abort(
      `accept_invitation failed: ${error.message ?? JSON.stringify(error)}`,
    );
  }
}

async function provisionOwner({
  platform,
  admin,
  baseUrl,
  apiKey,
  anonKey,
  label,
  email,
  name,
  password,
  companyName,
  dryRun,
}) {
  const existingUsers = await findExactUsers(baseUrl, apiKey, email);
  const existing = existingUsers[0] ?? null;
  if (existing) {
    const membership = await getMembership(admin, existing.id);
    if (membership?.active) {
      if (membership.company_id === DEMO_COMPANY_ID) {
        abort(`${label}: ${email} is bound to ${DEMO_COMPANY_ID}; refuse.`);
      }
      if (!membership.is_owner) {
        abort(`${label}: ${email} is an active member but not owner.`);
      }
      const signed = await signInAs(baseUrl, anonKey, email, password);
      if (!signed) {
        abort(
          `${label}: ${email} already owns ${membership.company_id} but password does not match. Set VERIFY_*_PASSWORD to the existing password.`,
        );
      }
      console.log(`${label}: reused owner ${email} on ${membership.company_id}`);
      return { companyId: membership.company_id, userId: existing.id, reused: true };
    }
  }

  const operationId = stableOperationId(`${label}:${email}:${companyName}`);
  console.log(`${label}: provision ${companyName} → ${email} (op ${operationId})`);

  if (dryRun) {
    console.log(`Would call platform_provision_company for ${label}`);
    return { companyId: null, userId: existing?.id ?? null, reused: false };
  }

  const { data, error } = await platform.database.rpc("platform_provision_company", {
    p_operation_id: operationId,
    p_name: companyName,
    p_owner_email: email,
    p_owner_name: name,
  });
  if (error) {
    // Owner already provisioned under a different operation — try resend path.
    const pending = await admin.database
      .from("invitations")
      .select("id,company_id,status,is_owner,expires_at")
      .eq("email", email)
      .eq("status", "pending")
      .eq("is_owner", true)
      .limit(5);
    if (pending.error) {
      abort(`${label}: provision failed: ${error.message}`);
    }
    const inv = (pending.data ?? [])[0];
    if (!inv) abort(`${label}: provision failed: ${error.message}`);

    const resent = await platform.database.rpc("platform_resend_owner_invitation", {
      p_company_id: inv.company_id,
    });
    if (resent.error || !resent.data?.invitationToken) {
      abort(
        `${label}: could not resend owner invitation: ${resent.error?.message ?? "no token"}`,
      );
    }
    const { user, created } = await ensureAuthUser(
      admin,
      baseUrl,
      apiKey,
      email,
      password,
      name,
      dryRun,
    );
    await acceptInvitation(admin, resent.data.invitationToken, user.id, name);
    console.log(
      `${label}: accepted pending invitation on ${inv.company_id} (${created ? "created" : "reused"} user)`,
    );
    return { companyId: inv.company_id, userId: user.id, reused: false };
  }

  const result = data ?? {};
  const companyId = result.companyId;
  const invitationToken = result.invitationToken;
  if (!companyId) abort(`${label}: provision returned no companyId.`);
  if (companyId === DEMO_COMPANY_ID) {
    abort(`${label}: refused — provision must not target ${DEMO_COMPANY_ID}.`);
  }

  if (!invitationToken) {
    // Already accepted on prior retry of same operation id.
    const membership = existing
      ? await getMembership(admin, existing.id)
      : null;
    if (membership?.company_id === companyId && membership.active) {
      const signed = await signInAs(baseUrl, anonKey, email, password);
      if (!signed) {
        abort(
          `${label}: company ${companyId} ready but password mismatch for ${email}.`,
        );
      }
      console.log(`${label}: company ${companyId} already accepted`);
      return { companyId, userId: existing.id, reused: true };
    }
    const resent = await platform.database.rpc("platform_resend_owner_invitation", {
      p_company_id: companyId,
    });
    if (resent.error || !resent.data?.invitationToken) {
      abort(
        `${label}: no invitation token for ${companyId}: ${resent.error?.message ?? "missing"}`,
      );
    }
    const { user, created } = await ensureAuthUser(
      admin,
      baseUrl,
      apiKey,
      email,
      password,
      name,
      false,
    );
    await acceptInvitation(admin, resent.data.invitationToken, user.id, name);
    console.log(
      `${label}: accepted via resend on ${companyId} (${created ? "created" : "reused"} user)`,
    );
    return { companyId, userId: user.id, reused: false };
  }

  const { user, created } = await ensureAuthUser(
    admin,
    baseUrl,
    apiKey,
    email,
    password,
    name,
    false,
  );
  await acceptInvitation(admin, invitationToken, user.id, name);
  console.log(
    `${label}: company ${companyId} owner ready (${created ? "created" : "reused"} user ${user.id})`,
  );
  return { companyId, userId: user.id, reused: false };
}

async function ensureViewer({
  admin,
  baseUrl,
  apiKey,
  anonKey,
  ownerEmail,
  ownerPassword,
  viewerEmail,
  viewerName,
  viewerPassword,
  invitationSecret,
  dryRun,
}) {
  const existingUsers = await findExactUsers(baseUrl, apiKey, viewerEmail);
  const existing = existingUsers[0] ?? null;
  if (existing) {
    const membership = await getMembership(admin, existing.id);
    if (membership?.active) {
      if (membership.company_id === DEMO_COMPANY_ID) {
        abort(`Viewer ${viewerEmail} is bound to ${DEMO_COMPANY_ID}; refuse.`);
      }
      const roles = membership.roles ?? [];
      if (!roles.includes("viewer")) {
        abort(
          `Viewer ${viewerEmail} is on ${membership.company_id} without viewer role.`,
        );
      }
      const signed = await signInAs(baseUrl, anonKey, viewerEmail, viewerPassword);
      if (!signed) {
        abort(
          `Viewer ${viewerEmail} exists but password mismatch. Set VERIFY_A_VIEWER_PASSWORD.`,
        );
      }
      console.log(`A-viewer: reused ${viewerEmail} on ${membership.company_id}`);
      return { companyId: membership.company_id, userId: existing.id };
    }
  }

  const owner = await signInAs(baseUrl, anonKey, ownerEmail, ownerPassword);
  if (!owner) abort("Tenant A owner sign-in failed before inviting viewer.");

  const companyRes = await owner.database.rpc("my_company_id");
  const companyId = companyRes.data;
  if (!companyId || companyRes.error) {
    abort("Tenant A owner has no my_company_id().");
  }
  if (companyId === DEMO_COMPANY_ID) {
    abort("Tenant A owner unexpectedly on co_1.");
  }

  const requestId = stableOperationId(`viewer:${companyId}:${viewerEmail}`);
  const { raw, hash } = invitationTokenPair(
    companyId,
    viewerEmail,
    requestId,
    invitationSecret,
  );

  console.log(`A-viewer: invite ${viewerEmail} to ${companyId}`);
  if (dryRun) {
    console.log("Would invite viewer and accept invitation.");
    return { companyId, userId: null };
  }

  const invited = await owner.database.rpc("invite_user", {
    p_email: viewerEmail,
    p_roles: ["viewer"],
    p_request_id: requestId,
    p_token_hash: hash,
  });
  if (invited.error) {
    abort(`invite_user failed: ${invited.error.message}`);
  }

  const { user, created } = await ensureAuthUser(
    admin,
    baseUrl,
    apiKey,
    viewerEmail,
    viewerPassword,
    viewerName,
    false,
  );
  await acceptInvitation(admin, raw, user.id, viewerName);
  console.log(
    `A-viewer: ready on ${companyId} (${created ? "created" : "reused"} user ${user.id})`,
  );
  return { companyId, userId: user.id };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const writeEnv = !args.includes("--no-write-env");
  const unknown = args.filter(
    (arg) => arg !== "--dry-run" && arg !== "--no-write-env",
  );
  if (unknown.length) abort(`Unsupported argument: ${unknown[0]}`);

  const baseUrl = canonicalOrigin(requiredEnv("INSFORGE_URL"));
  const apiKey = requiredEnv("INSFORGE_API_KEY");
  const anonKey = requiredEnv("NEXT_PUBLIC_INSFORGE_ANON_KEY");
  const platformEmail = normalizeEmail(requiredEnv("PLATFORM_ADMIN_EMAIL"));
  const platformPassword = requiredEnv("PLATFORM_ADMIN_PASSWORD");
  const invitationSecret = requiredEnv("INVITATION_TOKEN_SECRET");
  const demoOwnerEmail = process.env.DEMO_OWNER_EMAIL?.trim()
    ? normalizeEmail(process.env.DEMO_OWNER_EMAIL)
    : null;

  const aOwnerEmail = normalizeEmail(
    optionalEnv("VERIFY_A_OWNER_EMAIL", DEFAULTS.VERIFY_A_OWNER_EMAIL),
  );
  const aViewerEmail = normalizeEmail(
    optionalEnv("VERIFY_A_VIEWER_EMAIL", DEFAULTS.VERIFY_A_VIEWER_EMAIL),
  );
  const bOwnerEmail = normalizeEmail(
    optionalEnv("VERIFY_B_OWNER_EMAIL", DEFAULTS.VERIFY_B_OWNER_EMAIL),
  );
  const aOwnerName = optionalEnv("VERIFY_A_OWNER_NAME", DEFAULTS.VERIFY_A_OWNER_NAME);
  const aViewerName = optionalEnv(
    "VERIFY_A_VIEWER_NAME",
    DEFAULTS.VERIFY_A_VIEWER_NAME,
  );
  const bOwnerName = optionalEnv("VERIFY_B_OWNER_NAME", DEFAULTS.VERIFY_B_OWNER_NAME);
  const aCompanyName = optionalEnv(
    "VERIFY_A_COMPANY_NAME",
    DEFAULTS.VERIFY_A_COMPANY_NAME,
  );
  const bCompanyName = optionalEnv(
    "VERIFY_B_COMPANY_NAME",
    DEFAULTS.VERIFY_B_COMPANY_NAME,
  );

  const aOwnerPassword =
    process.env.VERIFY_A_OWNER_PASSWORD?.trim() || generatePassword();
  const aViewerPassword =
    process.env.VERIFY_A_VIEWER_PASSWORD?.trim() || generatePassword();
  const bOwnerPassword =
    process.env.VERIFY_B_OWNER_PASSWORD?.trim() || generatePassword();

  if (new Set([aOwnerEmail, aViewerEmail, bOwnerEmail]).size !== 3) {
    abort("VERIFY_A owner, VERIFY_A viewer, and VERIFY_B owner emails must be distinct.");
  }
  if (bOwnerEmail === platformEmail || BANNED_B_EMAILS.has(bOwnerEmail)) {
    abort(
      "VERIFY_B_OWNER_EMAIL must not be the platform admin / dual-hat identity.",
    );
  }
  if (demoOwnerEmail && [aOwnerEmail, aViewerEmail, bOwnerEmail].includes(demoOwnerEmail)) {
    abort("VERIFY_* emails must not reuse DEMO_OWNER_EMAIL.");
  }
  if ([aOwnerEmail, aViewerEmail, bOwnerEmail].includes(platformEmail)) {
    abort("VERIFY_* emails must not reuse PLATFORM_ADMIN_EMAIL.");
  }

  const linkedHost = canonicalOrigin(await readLinkedHost());
  if (
    baseUrl === canonicalOrigin(PARENT_HOST) &&
    process.env.VERIFY_ALLOW_PARENT !== "1"
  ) {
    abort("Refusing the parent backend without VERIFY_ALLOW_PARENT=1.");
  }
  if (baseUrl !== linkedHost) {
    abort("INSFORGE_URL does not match the linked InsForge project.");
  }

  const admin = createAdminClient({ baseUrl, apiKey });
  const platform = await signInAs(baseUrl, anonKey, platformEmail, platformPassword);
  if (!platform) abort("Platform admin sign-in failed.");
  const isAdmin = await platform.database.rpc("is_platform_admin");
  if (isAdmin.error || isAdmin.data !== true) {
    abort("Signed-in user is not a platform admin.");
  }

  console.log(`Target backend verified: ${baseUrl}`);
  console.log(`Platform admin: ${platformEmail}`);
  console.log(`Tenant A owner: ${aOwnerEmail}`);
  console.log(`Tenant A viewer: ${aViewerEmail}`);
  console.log(`Tenant B owner: ${bOwnerEmail}`);

  const tenantA = await provisionOwner({
    platform,
    admin,
    baseUrl,
    apiKey,
    anonKey,
    label: "A",
    email: aOwnerEmail,
    name: aOwnerName,
    password: aOwnerPassword,
    companyName: aCompanyName,
    dryRun,
  });

  const tenantB = await provisionOwner({
    platform,
    admin,
    baseUrl,
    apiKey,
    anonKey,
    label: "B",
    email: bOwnerEmail,
    name: bOwnerName,
    password: bOwnerPassword,
    companyName: bCompanyName,
    dryRun,
  });

  if (!dryRun && tenantA.companyId && tenantB.companyId) {
    if (tenantA.companyId === tenantB.companyId) {
      abort("Tenant A and Tenant B resolved to the same company_id.");
    }
  }

  await ensureViewer({
    admin,
    baseUrl,
    apiKey,
    anonKey,
    ownerEmail: aOwnerEmail,
    ownerPassword: aOwnerPassword,
    viewerEmail: aViewerEmail,
    viewerName: aViewerName,
    viewerPassword: aViewerPassword,
    invitationSecret,
    dryRun,
  });

  const runId = process.env.VERIFY_RUN_ID?.trim() || generateRunId();
  const envPairs = {
    VERIFY_A_OWNER_EMAIL: aOwnerEmail,
    VERIFY_A_OWNER_PASSWORD: aOwnerPassword,
    VERIFY_A_VIEWER_EMAIL: aViewerEmail,
    VERIFY_A_VIEWER_PASSWORD: aViewerPassword,
    VERIFY_B_OWNER_EMAIL: bOwnerEmail,
    VERIFY_B_OWNER_PASSWORD: bOwnerPassword,
    VERIFY_ALLOW_MUTATION: "erp-backend-v1",
    VERIFY_RUN_ID: runId,
  };

  console.log("");
  console.log("Set these keys in .env.local (values redacted here):");
  for (const key of ENV_KEYS) {
    console.log(`  ${key}`);
  }
  console.log(`Companies: A=${tenantA.companyId ?? "(dry-run)"} B=${tenantB.companyId ?? "(dry-run)"}`);

  if (!dryRun && writeEnv) {
    await upsertEnvLocal(envPairs);
    console.log(`Wrote VERIFY_* keys to ${ENV_LOCAL}`);
  } else if (dryRun) {
    console.log("Dry run complete; no mutations or .env.local writes.");
  }

  if (!dryRun) {
    for (const [label, email, password] of [
      ["A-owner", aOwnerEmail, aOwnerPassword],
      ["A-viewer", aViewerEmail, aViewerPassword],
      ["B-owner", bOwnerEmail, bOwnerPassword],
    ]) {
      const client = await signInAs(baseUrl, anonKey, email, password);
      if (!client) abort(`Post-bootstrap sign-in failed for ${label}.`);
      const mine = await client.database.rpc("my_company_id");
      if (mine.error || !mine.data) {
        abort(`${label} has no company after bootstrap.`);
      }
      if (mine.data === DEMO_COMPANY_ID) {
        abort(`${label} unexpectedly on ${DEMO_COMPANY_ID}.`);
      }
      console.log(`Verified sign-in ${label} → company ${mine.data}`);
    }
  }
}

main().catch((error) => {
  const message =
    error instanceof BootstrapError
      ? error.message
      : error?.message ?? "Unexpected bootstrap failure.";
  console.error(`Verify tenant bootstrap failed: ${message}`);
  process.exitCode = 1;
});
