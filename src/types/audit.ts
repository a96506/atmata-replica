import type { DocState, DocType, ISO8601 } from "./common";

export type AuditEvent = {
  id: string;
  docId: string;
  docType: DocType;
  fromState: DocState | null;
  toState: DocState;
  by: string | null;
  at: ISO8601;
  reason?: string | null;
};
