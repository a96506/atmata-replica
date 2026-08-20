import { z } from "zod";
import { actionSchema } from "@/lib/actions/validation";
import { KnownActionError } from "@/lib/actions/errors";
import { ASSIGNABLE_USER_ROLES, isAssignableUserRole, normalizeRoles } from "../domain/roles";
import type { AssignableUserRole } from "@/types";

const emailSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.string().email().min(3).max(320));

function parseRoles(roles: unknown): AssignableUserRole[] {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new KnownActionError("VALIDATION", {
      fieldErrors: { roles: ["settings.users.validation.roles"] },
      messageKey: "settings.users.validation.roles",
    });
  }
  if (roles.some((role) => role === "ai_agent")) {
    throw new KnownActionError("VALIDATION", {
      fieldErrors: { roles: ["settings.users.validation.aiAgent"] },
      messageKey: "settings.users.validation.aiAgent",
    });
  }
  if (roles.some((role) => typeof role !== "string" || !isAssignableUserRole(role))) {
    throw new KnownActionError("VALIDATION", {
      fieldErrors: { roles: ["settings.users.validation.roles"] },
      messageKey: "settings.users.validation.roles",
    });
  }
  try {
    return normalizeRoles(roles as string[]);
  } catch {
    throw new KnownActionError("VALIDATION", {
      fieldErrors: { roles: ["settings.users.validation.roles"] },
      messageKey: "settings.users.validation.roles",
    });
  }
}

export function normalizeEmail(email: string): string {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    throw new KnownActionError("VALIDATION", {
      fieldErrors: { email: ["settings.users.validation.email"] },
      messageKey: "settings.users.validation.email",
    });
  }
  return parsed.data;
}

export const inviteUserSchema = actionSchema({
  locale: z.enum(["en", "ar"]),
  email: z.string().min(1).max(320),
  roles: z.array(z.string()).min(1).max(ASSIGNABLE_USER_ROLES.length),
  requestId: z.string().uuid(),
});

export const setMemberRolesSchema = actionSchema({
  locale: z.enum(["en", "ar"]),
  userId: z.string().uuid(),
  roles: z.array(z.string()).min(1).max(ASSIGNABLE_USER_ROLES.length),
});

export const deactivateMemberSchema = actionSchema({
  locale: z.enum(["en", "ar"]),
  userId: z.string().uuid(),
});

export function parseInviteInput(input: {
  locale: "en" | "ar";
  email: string;
  roles: string[];
  requestId: string;
}) {
  return {
    locale: input.locale,
    email: normalizeEmail(input.email),
    roles: parseRoles(input.roles),
    requestId: input.requestId,
  };
}

export function parseRoleUpdate(input: { locale: "en" | "ar"; userId: string; roles: string[] }) {
  return {
    locale: input.locale,
    userId: input.userId,
    roles: parseRoles(input.roles),
  };
}
