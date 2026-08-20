import "server-only";

import type { Role } from "@/types";
import type { Session } from "@/lib/session";
import { createInsForgeServerClient } from "@/lib/insforge/server";

type MemberRow = {
  company_id: string;
  roles: Role[];
};

type CompanyRow = {
  id: string;
  name: string;
  status: "active" | "suspended";
};

export type AppSessionResult =
  | { session: Session; reason: null }
  | { session: null; reason: "unauthenticated" | "no_company" | "suspended" };

export async function getAppSession(): Promise<AppSessionResult> {
  const insforge = await createInsForgeServerClient();
  const { data: authData, error: authError } =
    await insforge.auth.getCurrentUser();
  const user = authData?.user;

  if (authError || !user) {
    return { session: null, reason: "unauthenticated" };
  }

  const { data: memberData, error: memberError } = await insforge.database
    .from("company_members")
    .select("company_id, roles")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  const member = memberData as MemberRow | null;

  if (memberError || !member) {
    return { session: null, reason: "no_company" };
  }

  const { data: companyData, error: companyError } = await insforge.database
    .from("companies")
    .select("id, name, status")
    .eq("id", member.company_id)
    .maybeSingle();
  const company = companyData as CompanyRow | null;

  if (companyError || !company) {
    return { session: null, reason: "no_company" };
  }
  if (company.status !== "active") {
    return { session: null, reason: "suspended" };
  }

  const roles = member.roles;
  const role = roles.includes("admin") ? "admin" : (roles[0] ?? "viewer");

  return {
    reason: null,
    session: {
      user: {
        id: user.id,
        name: user.profile?.name?.trim() || user.email,
        email: user.email,
      },
      role,
      roles,
      company: {
        id: company.id,
        name: company.name,
      },
      companyId: company.id,
    },
  };
}

export type PlatformAdminGate =
  | { user: { id: string; name: string; email: string }; reason: null }
  | { user: null; reason: "unauthenticated" | "not_platform_admin" };

export async function getPlatformAdminGate(): Promise<PlatformAdminGate> {
  const insforge = await createInsForgeServerClient();
  const { data: authData, error: authError } =
    await insforge.auth.getCurrentUser();
  const user = authData?.user;

  if (authError || !user) {
    return { user: null, reason: "unauthenticated" };
  }

  const { data: isAdmin, error } = await insforge.database.rpc(
    "is_platform_admin",
  );
  if (error || isAdmin !== true) {
    return { user: null, reason: "not_platform_admin" };
  }

  return {
    reason: null,
    user: {
      id: user.id,
      name: user.profile?.name?.trim() || user.email,
      email: user.email,
    },
  };
}
