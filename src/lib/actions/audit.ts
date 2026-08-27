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
