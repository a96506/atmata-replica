import type { ActionErrorCode } from "@/lib/actions/result";

export function parseUserAdminRpcError(message: string | undefined): ActionErrorCode {
  const text = (message ?? "").toLowerCase();
  if (
    text.includes("company admin required") ||
    text.includes("active company membership required") ||
    text.includes("self-deactivation") ||
    text.includes("auth email does not match")
  ) {
    return "FORBIDDEN";
  }
  if (
    text.includes("invalid human role") ||
    text.includes("invalid invitation email") ||
    text.includes("invalid invitation token hash") ||
    text.includes("request id is required") ||
    text.includes("positive invitation expiry") ||
    text.includes("full name is required") ||
    text.includes("invitation token and user")
  ) {
    return "VALIDATION";
  }
  if (text.includes("member not found") || text.includes("invalid invitation") || text.includes("auth user not found") || text.includes("invalid or expired")) {
    return "NOT_FOUND";
  }
  if (
    text.includes("already used with different") ||
    text.includes("already accepted") ||
    text.includes("already belongs")
  ) {
    return "CONFLICT";
  }
  if (
    text.includes("last active owner") ||
    text.includes("cannot remove admin") ||
    text.includes("cannot deactivate")
  ) {
    return "INVARIANT";
  }
  return "INTERNAL";
}
