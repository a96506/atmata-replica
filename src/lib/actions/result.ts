export type ActionResult<T> =
  | {
      ok: true;
      data: T;
      messageKey?: string;
    }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        messageKey: string;
        fieldErrors?: Record<string, string[]>;
        retryable: boolean;
        currentRowVersion?: number;
        requestId: string;
      };
    };

export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_VERSION"
  | "ILLEGAL_TRANSITION"
  | "PERIOD_CLOSED"
  | "DUPLICATE"
  | "INVARIANT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "EMAIL_DELIVERY_FAILED"
  | "STORAGE_FAILED"
  | "MODEL_FAILED"
  | "INTERNAL";
