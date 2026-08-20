import fs from "node:fs";
import crypto from "node:crypto";
import { createAdminClient } from "@insforge/sdk";

const envPath = ".env.local";
let env = fs.readFileSync(envPath, "utf8");
function get(key) {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}
function upsert(key, value) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, "m").test(env)) {
    env = env.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    env += `\n${line}\n`;
  }
}

const baseUrl = process.env.INSFORGE_URL;
const apiKey = process.env.INSFORGE_API_KEY;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const ownerEmail = (process.env.DEMO_OWNER_EMAIL || "123@gmail.com").toLowerCase();
let password = process.env.DEMO_OWNER_PASSWORD;
if (!password) {
  password = crypto.randomBytes(18).toString("base64url");
  upsert("DEMO_OWNER_PASSWORD", password);
}
if (!get("DEMO_OWNER_NAME")) upsert("DEMO_OWNER_NAME", "Demo Owner");
upsert("DEMO_OWNER_EMAIL", ownerEmail);
fs.writeFileSync(envPath, env.endsWith("\n") ? env : `${env}\n`);

async function login(email, pwd) {
  const res = await fetch(`${baseUrl}/api/auth/sessions?client_type=mobile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: pwd }),
  });
  if (!res.ok) return null;
  return res.json();
}

const e2eEmail = "e2e.demo.owner@atmata.example";
const ownerSession = await login(ownerEmail, password);
if (ownerSession?.user?.id && ownerEmail !== e2eEmail) {
  console.log("demo-owner-login: ok");
  process.exit(0);
}

const admin = createAdminClient({ baseUrl, apiKey });

async function ensureMembership(userId) {
  const { error: profileError } = await admin.database.from("user_profiles").upsert(
    [{ id: userId, full_name: "E2E Demo Owner", email: e2eEmail, locale: "en", active: true }],
    { onConflict: "id" },
  );
  if (profileError) {
    console.error("e2e-profile: failed");
    process.exit(1);
  }
  const { error: memberError } = await admin.database.from("company_members").upsert(
    [{ company_id: "co_1", user_id: userId, roles: ["admin", "sales_rep", "buyer"], is_owner: false, active: true }],
    { onConflict: "user_id" },
  );
  if (memberError) {
    console.error("e2e-membership: failed", memberError.message);
    process.exit(1);
  }
}

const { data, error } = await admin.auth.signUp({
  email: e2eEmail,
  password,
  name: "E2E Demo Owner",
  autoConfirm: true,
});
let user = data?.user;
if (!user) {
  const reused = await login(e2eEmail, password);
  if (!reused?.user?.id) {
    console.error("e2e-user-create: failed", error?.message || "unknown");
    process.exit(1);
  }
  user = reused.user;
}

await ensureMembership(user.id);
upsert("DEMO_OWNER_EMAIL", e2eEmail);
fs.writeFileSync(envPath, env.endsWith("\n") ? env : `${env}\n`);
if (!(await login(e2eEmail, password))) {
  console.error("e2e-user-login: failed");
  process.exit(1);
}
console.log("demo-owner-login: e2e-user-ready");
