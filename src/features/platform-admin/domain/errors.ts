import type { ActionErrorCode } from "@/lib/actions/result";

export const PLATFORM_ADMIN_ERROR_CODES = [
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "STALE_VERSION",
  "VALIDATION",
  "EMAIL_DELIVERY_FAILED",
  "INTERNAL",
] as const satisfies readonly ActionErrorCode[];

export type PlatformAdminErrorCode = (typeof PLATFORM_ADMIN_ERROR_CODES)[number];

const PLATFORM_PREFIX = /^PLATFORM:([A-Z_]+)(?::(.*))?$/;

export function parsePlatformRpcError(message: string | undefined): {
  code: ActionErrorCode;
  currentRowVersion?: number;
} {
  const match = message?.trim().match(PLATFORM_PREFIX);
  if (!match) return { code: "INTERNAL" };
  const code = match[1];
  const detail = match[2];
  if (code === "STALE_VERSION") {
    const version = Number(detail);
    return {
      code: "STALE_VERSION",
      currentRowVersion: Number.isFinite(version) ? version : undefined,
    };
  }
  if (
    code === "UNAUTHENTICATED" ||
    code === "NOT_FOUND" ||
    code === "FORBIDDEN" ||
    code === "CONFLICT" ||
    code === "VALIDATION" ||
    code === "INVARIANT" ||
    code === "ILLEGAL_TRANSITION"
  ) {
    return { code };
  }
  return { code: "INTERNAL" };
}
