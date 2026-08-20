import type { FunctionError } from "@/types/functions";

export function isFunctionError(value: unknown): value is FunctionError {
  if (!value || typeof value !== "object") return false;
  const error = (value as { error?: unknown }).error;
  return Boolean(
    error &&
      typeof error === "object" &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { messageKey?: unknown }).messageKey === "string" &&
      typeof (error as { requestId?: unknown }).requestId === "string",
  );
}
