import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createAdminClient } from "@insforge/sdk";

const COMPANY_ID = "co_1";
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

/** Scheme + host + non-default port; rejects path/query/fragment/credentials. */
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
    "Unable to look up the demo owner account.",
  );
  if (!Array.isArray(payload?.data)) {
    abort("Unable to look up the demo owner account.");
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

async function getAuthUser(baseUrl, apiKey, userId) {
  const user = await adminGet(
    baseUrl,
    apiKey,
    `/api/auth/users/${encodeURIComponent(userId)}`,
    "Unable to verify the existing company owner.",
  );
  if (
    typeof user?.id !== "string" ||
    typeof user?.email !== "string"
  ) {
    abort("Unable to verify the existing company owner.");
  }
  return user;
}

async function requireActiveCompany(admin) {
  const { data, error } = await admin.database
    .from("companies")
    .select("id,status")
    .eq("id", COMPANY_ID)
    .maybeSingle();

  if (error) abort("Unable to verify the demo company.");
  if (!data) abort("Demo company co_1 does not exist.");
  if (data.status !== "active") abort("Demo company co_1 is not active.");
}

async function getActiveOwnerIds(admin) {
  const { data, error } = await admin.database
    .from("company_members")
    .select("user_id")
    .eq("company_id", COMPANY_ID)
    .eq("is_owner", true)
    .eq("active", true);

  if (error || !Array.isArray(data)) {
    abort("Unable to verify existing demo company owners.");
  }
  return data.map((member) => member.user_id);
}

async function getMembership(admin, userId) {
  const { data, error } = await admin.database
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) abort("Unable to verify the demo owner membership.");
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
  const email = normalizeEmail(requiredEnv("DEMO_OWNER_EMAIL"));
  const name = requiredEnv("DEMO_OWNER_NAME");
  const password = process.env.DEMO_OWNER_PASSWORD;

  if (!dryRun && !password) {
    abort("Missing required environment variable: DEMO_OWNER_PASSWORD.");
  }

  const linkedHost = canonicalOrigin(await readLinkedHost());
  if (
    baseUrl === canonicalOrigin(PARENT_HOST) &&
    process.env.DEMO_OWNER_ALLOW_PARENT !== "1"
  ) {
    abort("Refusing the parent backend without DEMO_OWNER_ALLOW_PARENT=1.");
  }
  if (baseUrl !== linkedHost) {
    abort("INSFORGE_URL does not match the linked InsForge project.");
  }

  const admin = createAdminClient({ baseUrl, apiKey });
  await requireActiveCompany(admin);

  let exactUsers = await findExactUsers(baseUrl, apiKey, email);
  let user = exactUsers[0] ?? null;

  const activeOwnerIds = await getActiveOwnerIds(admin);
  let sameEmailOwnerId = null;
  for (const ownerId of activeOwnerIds) {
    const owner = await getAuthUser(baseUrl, apiKey, ownerId);
    if (normalizeEmail(owner.email) !== email) {
      abort("A different active owner already exists for co_1.");
    }
    sameEmailOwnerId = owner.id;
  }

  if (sameEmailOwnerId && !user) {
    abort("The existing owner could not be resolved by normalized email.");
  }
  if (sameEmailOwnerId && user.id !== sameEmailOwnerId) {
    abort("The requested email conflicts with the existing owner identity.");
  }

  if (user) {
    const membership = await getMembership(admin, user.id);
    if (membership && membership.company_id !== COMPANY_ID) {
      abort("The demo owner account already belongs to another company.");
    }
  }

  console.log(`Target backend verified: ${baseUrl}`);
  console.log(`Demo owner: ${email}`);
  console.log(`Company verified: ${COMPANY_ID} (active)`);

  if (dryRun) {
    console.log(
      user
        ? `Would reuse auth user: ${user.id}`
        : "Would create and auto-confirm the auth user.",
    );
    console.log("Would upsert the active user profile on conflict id.");
    console.log(
      "Would upsert the active co_1 owner/admin membership on conflict user_id.",
    );
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
      if (!user) abort("Unable to create the demo owner auth account.");
    }
  }

  const membership = await getMembership(admin, user.id);
  if (membership && membership.company_id !== COMPANY_ID) {
    abort("The demo owner account already belongs to another company.");
  }

  const { error: profileError } = await admin.database
    .from("user_profiles")
    .upsert(
      [
        {
          id: user.id,
          full_name: name,
          email,
          locale: "en",
          active: true,
        },
      ],
      { onConflict: "id" },
    );
  if (profileError) abort("Unable to upsert the demo owner profile.");

  const { error: membershipError } = await admin.database
    .from("company_members")
    .upsert(
      [
        {
          company_id: COMPANY_ID,
          user_id: user.id,
          roles: ["admin"],
          is_owner: true,
          active: true,
        },
      ],
      { onConflict: "user_id" },
    );
  if (membershipError) abort("Unable to upsert the demo owner membership.");

  console.log(`${created ? "Created" : "Reused"} auth user: ${user.id}`);
  console.log("Demo owner profile and co_1 owner/admin membership are ready.");
}

main().catch((error) => {
  const message =
    error instanceof BootstrapError
      ? error.message
      : "Unexpected bootstrap failure.";
  console.error(`Demo owner bootstrap failed: ${message}`);
  process.exitCode = 1;
});
