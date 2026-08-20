import type { ActionErrorCode, ActionResult } from "./result";

type ActionFailure = Extract<ActionResult<never>, { ok: false }>;
type ActionErrorPayload = ActionFailure["error"];

type KnownActionErrorOptions = {
  fieldErrors?: Record<string, string[]>;
  retryable?: boolean;
  currentRowVersion?: number;
};

type NormalizeActionErrorOptions = {
  requestId?: string;
  onUnexpected?: (error: unknown, requestId: string) => void;
};

const DEFAULT_MESSAGE_KEYS: Record<ActionErrorCode, string> = {
  UNAUTHENTICATED: "errors.unauthenticated",
  FORBIDDEN: "errors.forbidden",
  VALIDATION: "errors.validation",
  NOT_FOUND: "errors.notFound",
  CONFLICT: "errors.conflict",
  STALE_VERSION: "errors.staleVersion",
  ILLEGAL_TRANSITION: "errors.illegalTransition",
  PERIOD_CLOSED: "errors.periodClosed",
  DUPLICATE: "errors.duplicate",
  INVARIANT: "errors.invariant",
  RATE_LIMITED: "errors.rateLimited",
  UNAVAILABLE: "errors.unavailable",
  EMAIL_DELIVERY_FAILED: "errors.emailDeliveryFailed",
  STORAGE_FAILED: "errors.storageFailed",
  MODEL_FAILED: "errors.modelFailed",
  INTERNAL: "errors.internal",
};

const WRITE_PREFIX = /^WRITE:([A-Z_]+)(?::(.*))?$/;

const WRITE_ERROR_CODES = new Set<ActionErrorCode>([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "STALE_VERSION",
  "ILLEGAL_TRANSITION",
  "PERIOD_CLOSED",
  "DUPLICATE",
  "INVARIANT",
  "UNAVAILABLE",
]);

export class KnownActionError extends Error {
  readonly code: ActionErrorCode;
  readonly messageKey: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryable: boolean;
  readonly currentRowVersion?: number;

  constructor(
    code: ActionErrorCode,
    options: KnownActionErrorOptions & { messageKey?: string } = {},
  ) {
    super(code);
    this.name = "KnownActionError";
    this.code = code;
    this.messageKey = options.messageKey ?? DEFAULT_MESSAGE_KEYS[code];
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable ?? false;
    this.currentRowVersion = options.currentRowVersion;
  }
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function actionFailure(
  code: ActionErrorCode,
  options: KnownActionErrorOptions & {
    messageKey?: string;
    requestId?: string;
  } = {},
): ActionFailure {
  const error: ActionErrorPayload = {
    code,
    messageKey: options.messageKey ?? DEFAULT_MESSAGE_KEYS[code],
    retryable: options.retryable ?? false,
    requestId: options.requestId ?? createRequestId(),
  };

  if (options.fieldErrors) error.fieldErrors = options.fieldErrors;
  if (options.currentRowVersion !== undefined) {
    error.currentRowVersion = options.currentRowVersion;
  }

  return { ok: false, error };
}

/** Parse M13 `WRITE:<CODE>[:detail]` RPC exceptions into ActionErrorCode. */
export function parseWriteRpcError(message: string | undefined): {
  code: ActionErrorCode;
  currentRowVersion?: number;
  detail?: string;
} {
  const match = message?.trim().match(WRITE_PREFIX);
  if (!match) return { code: "INTERNAL" };

  const code = match[1];
  const detail = match[2];

  if (code === "STALE_VERSION") {
    const version = Number(detail);
    return {
      code: "STALE_VERSION",
      currentRowVersion: Number.isFinite(version) ? version : undefined,
      detail,
    };
  }

  if (WRITE_ERROR_CODES.has(code as ActionErrorCode)) {
    return { code: code as ActionErrorCode, detail };
  }

  return { code: "INTERNAL", detail };
}

export function normalizeActionError(
  error: unknown,
  options: NormalizeActionErrorOptions = {},
): ActionFailure {
  const requestId = options.requestId ?? createRequestId();

  if (error instanceof KnownActionError) {
    return actionFailure(error.code, {
      messageKey: error.messageKey,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable,
      currentRowVersion: error.currentRowVersion,
      requestId,
    });
  }

  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : typeof error === "string"
        ? error
        : undefined;

  const parsed = parseWriteRpcError(message);
  if (parsed.code !== "INTERNAL") {
    return actionFailure(parsed.code, {
      currentRowVersion: parsed.currentRowVersion,
      retryable:
        parsed.code === "STALE_VERSION" ||
        parsed.code === "CONFLICT" ||
        parsed.code === "UNAVAILABLE",
      requestId,
    });
  }

  options.onUnexpected?.(error, requestId);

  return actionFailure("INTERNAL", { requestId });
}
