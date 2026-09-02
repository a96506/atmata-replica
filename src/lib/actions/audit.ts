"use server";

import "server-only";

import type { DocType } from "@/types";
import { writeAuditEvent } from "@/lib/api/audit";
import { getAppSession } from "@/lib/insforge/session";

/**
 * Audit server actions. The state-transition RPCs already write audit_events
 * internally; this module is for the side-channel events that happen outside
 * those RPCs — attachment add/remove on a document, and any future field-level
 * change events. Writes are defensive: if the parallel migration adding
 * `event_type`/`change_detail` has not landed, the write falls back to the
 * narrow column set (see `writeAuditEvent`).
 */

/** Resolve the caller's user id from the session-bound server client. */
async function currentUserId(): Promise<string | null> {
  const { session } = await getAppSession();
  return session?.user.id ?? null;
}

export async function recordAttachmentAddedEvent(input: {
  docType: DocType | string;
  docId: string;
  attachmentId: string;
  key: string;
  name?: string | null;
}): Promise<void> {
  const by = await currentUserId();
  await writeAuditEvent({
    docType: input.docType as DocType,
    docId: input.docId,
    fromState: null,
    toState: null,
    by,
    reason: "attachment added",
    eventType: "attachment_added",
    changeDetail: {
      attachmentId: input.attachmentId,
      key: input.key,
      name: input.name ?? null,
    },
  });
}

export async function recordAttachmentRemovedEvent(input: {
  docType: DocType | string;
  docId: string;
  attachmentId: string;
  key?: string | null;
  name?: string | null;
}): Promise<void> {
  const by = await currentUserId();
  await writeAuditEvent({
    docType: input.docType as DocType,
    docId: input.docId,
    fromState: null,
    toState: null,
    by,
    reason: "attachment removed",
    eventType: "attachment_removed",
    changeDetail: {
      attachmentId: input.attachmentId,
      key: input.key ?? null,
      name: input.name ?? null,
    },
  });
}

/**
 * Field-level change event. `changeDetail` keys (`field` / `old` / `new`) match
 * `HistoryTab` `changeDetailLabel` for `event_type = field_change`.
 */
export async function recordFieldChangeEvent(input: {
  docType: DocType | string;
  docId: string;
  field: string;
  old?: unknown;
  new?: unknown;
  reason?: string | null;
}): Promise<void> {
  const by = await currentUserId();
  await writeAuditEvent({
    docType: input.docType as DocType,
    docId: input.docId,
    fromState: null,
    toState: null,
    by,
    reason: input.reason ?? "field changed",
    eventType: "field_change",
    changeDetail: {
      field: input.field,
      old: input.old ?? null,
      new: input.new ?? null,
    },
  });
}

/** Emit one `field_change` per key that actually changed (string compare). */
export async function recordChangedFields(input: {
  docType: DocType | string;
  docId: string;
  before: Record<string, unknown>;
  patch: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string | null;
}): Promise<void> {
  for (const field of Object.keys(input.patch)) {
    const oldVal = input.before[field] ?? null;
    const newVal =
      (input.after ? input.after[field] : undefined) ??
      input.patch[field] ??
      null;
    if (String(oldVal ?? "") === String(newVal ?? "")) continue;
    await recordFieldChangeEvent({
      docType: input.docType,
      docId: input.docId,
      field,
      old: oldVal,
      new: newVal,
      reason: input.reason,
    });
  }
}
