import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createAdminClient } from "@insforge/sdk";

const PARENT_HOST = "https://yfmw4i43.eu-central.insforge.app";
const PROJECT_FILE = fileURLToPath(
  new URL("../.insforge/project.json", import.meta.url),
);

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

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
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
    "Unable to look up the platform administrator account.",
  );

  if (!Array.isArray(payload?.data)) {
    abort("Unable to look up the platform administrator account.");
  }

  const exact = payload.data.filter(
    (user) =>
      typeof user?.email === "string" &&
      normalizeEmail(user.email) === email,
  );

  if (exact.length > 1) {
    abort("Multiple auth users have the requested normalized email.");
  }

  return exact;
}

async function rejectOwnerIdentity(admin, userId) {
  const { data, error } = await admin.database
    .from("company_members")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_owner", true)
    .maybeSingle();

  if (error) {
    abort("Unable to verify the target company ownership.");
  }
  if (data) {
    abort("The platform administrator identity is a company owner.");
  }
}

async function getPlatformAdmin(admin, userId) {
  const { data, error } = await admin.database
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) abort("Unable to verify the platform administrator record.");
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  if (args.some((arg) => arg !== "--dry-run")) {
    abort("Unsupported command-line argument.");
  }

  const baseUrl = canonicalOrigin(requiredEnv("INSFORGE_URL"));
  const apiKey = requiredEnv("INSFORGE_API_KEY");
  const email = normalizeEmail(requiredEnv("PLATFORM_ADMIN_EMAIL"));
  const demoOwnerEmail = process.env.DEMO_OWNER_EMAIL?.trim()
    ? normalizeEmail(process.env.DEMO_OWNER_EMAIL)
    : null;

  if (demoOwnerEmail && email === demoOwnerEmail) {
    abort("PLATFORM_ADMIN_EMAIL must differ from DEMO_OWNER_EMAIL.");
  }

  const linkedHost = canonicalOrigin(await readLinkedHost());
  if (
    baseUrl === canonicalOrigin(PARENT_HOST) &&
    process.env.PLATFORM_ADMIN_ALLOW_PARENT !== "1"
  ) {
    abort(
      "Refusing the parent backend without PLATFORM_ADMIN_ALLOW_PARENT=1.",
    );
  }
  if (baseUrl !== linkedHost) {
    abort("INSFORGE_URL does not match the linked InsForge project.");
  }

  const admin = createAdminClient({ baseUrl, apiKey });
  let exactUsers = await findExactUsers(baseUrl, apiKey, email);
  let user = exactUsers[0] ?? null;
  if (user) {
    await rejectOwnerIdentity(admin, user.id);
  }
  const existingPlatformAdmin = user
    ? await getPlatformAdmin(admin, user.id)
    : null;

  const name = process.env.PLATFORM_ADMIN_NAME?.trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!user && !name) {
    abort(
      "Missing required environment variable for new auth user: PLATFORM_ADMIN_NAME.",
    );
  }
  if (!dryRun && !user && !password) {
    abort(
      "Missing required environment variable for new auth user: PLATFORM_ADMIN_PASSWORD.",
    );
  }

  console.log(`Target backend verified: ${baseUrl}`);
  console.log(`Platform administrator: ${email}`);
  console.log("Verified that the identity is not a company owner.");

  if (dryRun) {
    console.log(
      user
        ? `Would reuse auth user: ${user.id}`
        : "Would create and auto-confirm the auth user.",
    );
    console.log(
      existingPlatformAdmin
        ? "Platform administrator record already exists."
        : "Would insert the platform administrator record.",
    );
    console.log("Would not create or change any company membership.");
    console.log("Dry run complete; no mutations were made.");
    return;
  }

  let created = false;
  if (!user) {
    const { data, error } = await admin.auth.signUp({
      email,
      password,
      name,
      autoConfirm: true,
    });

    if (!error && data?.user) {
      user = data.user;
      created = true;
    } else {
      exactUsers = await findExactUsers(baseUrl, apiKey, email);
      user = exactUsers[0] ?? null;
      if (!user) {
        abort("Unable to create the platform administrator auth account.");
      }
    }

  }

  // Recheck immediately before granting platform authority. The identity
  // migration's trigger is the authoritative atomic owner/platform guard.
  await rejectOwnerIdentity(admin, user.id);

  const { error: platformAdminError } = await admin.database
    .from("platform_admins")
    .upsert([{ user_id: user.id }], { onConflict: "user_id" });

  if (platformAdminError) {
    abort("Unable to insert the platform administrator record.");
  }

  console.log(`${created ? "Created" : "Reused"} auth user: ${user.id}`);
  console.log("Platform administrator record is ready.");
  console.log("No company membership was created or changed.");
}

main().catch((error) => {
  const message =
    error instanceof BootstrapError
      ? error.message
      : "Unexpected bootstrap failure.";
  console.error(`Platform administrator bootstrap failed: ${message}`);
  process.exitCode = 1;
});
