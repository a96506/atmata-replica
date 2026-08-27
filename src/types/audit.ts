import type { DocState, DocType, ISO8601 } from "./common";

/** Display name + email for the user who performed the audit action. */
export type AuditActor = {
  fullName: string | null;
  email: string | null;
};

/**
 * Audit event. `by` is the raw user UUID (still stored for traceability);
 * `actor` carries the resolved display name/email when available.
 *
 * `eventType` + `changeDetail` are added by a parallel migration. Read
 * defensively — they may be absent on older rows or before the migration lands.
 */
export type AuditEvent = {
  id: string;
  docId: string;
  docType: DocType;
  fromState: DocState | null;
  toState: DocState | null;
  by: string | null;
  at: ISO8601;
  reason?: string | null;
  /** Optional — present only after the change-detail migration. */
  eventType?: string | null;
  /** Optional JSONB — old/new field values or attachment metadata. */
  changeDetail?: Record<string, unknown> | null;
  /** Resolved actor display info — null when `by` could not be resolved. */
  actor?: AuditActor | null;
};
