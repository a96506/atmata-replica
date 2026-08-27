"use server";

import { revalidatePath } from "next/cache";

import { camelize } from "@/lib/db/case";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertAllowedAttachmentMime } from "@/lib/actions/attachment-mime";
import {
  recordAttachmentAddedEvent,
  recordAttachmentRemovedEvent,
} from "@/lib/actions/audit";
import type { Attachment } from "@/types/entities";

/**
 * Storage Server Actions. The actual file bytes go up directly from the
 * browser via `createBrowserClient()` so Storage RLS sees the signed-in user
 * and the access token never crosses the server boundary. These actions
 * handle the DB side: insert the `attachments` row after a successful
 * upload, list, and delete (object + row).
 *
 * Path convention enforced by storage RLS: the first path segment of `key`
 * MUST be the caller's company id. Callers pass the full key they uploaded to;
 * the DB CHECK constraint + storage RLS reject mismatches.
 */

function assertCompanyPrefix(key: string, companyId: string): void {
  if (!key.startsWith(`${companyId}/`)) {
    throw new Error(
      `storage key must start with company id "${companyId}/" — got "${key}"`,
    );
  }
}

export async function listAttachments(input: {
  docType: string;
  docId: string;
}): Promise<Attachment[]> {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("attachments")
    .select("*")
    .eq("doc_type", input.docType)
    .eq("doc_id", input.docId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return camelize<Attachment[]>(data ?? []);
}

export async function insertAttachment(input: {
  docType: string;
  docId: string | null;
  bucket: "documents" | "imports";
  key: string;
  url: string;
  mime: string | null;
  size: number | null;
  filename: string;
}): Promise<Attachment> {
  const insforge = await createInsForgeServerClient();

  // my_company_id() is the RLS predicate; fetch it once to validate the key
  // prefix client-side before the round-trip (clearer error than RLS denial).
  const { data: cidRow, error: cidErr } = await insforge.database.rpc("my_company_id");
  if (cidErr) throw new Error(cidErr.message);
  const companyId = cidRow as unknown as string;
  if (!companyId) throw new Error("no active company membership");
  assertCompanyPrefix(input.key, companyId);
  assertAllowedAttachmentMime(input.mime);

  const { data, error } = await insforge.database
    .from("attachments")
    .insert([
      {
        doc_type: input.docType,
        doc_id: input.docId,
        bucket: input.bucket,
        key: input.key,
        url: input.url,
        mime: input.mime,
        size: input.size,
        filename: input.filename,
      },
    ])
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const attachment = camelize<Attachment>(data);

  // Best-effort audit event for the upload. Only when the attachment is
  // linked to a concrete document (doc_id != null) — OCR job uploads link
  // the attachment row before a vendor_bill exists, so they have no doc_id
  // yet; the bill-creation flow writes its own audit trail.
  if (input.docId) {
    try {
      await recordAttachmentAddedEvent({
        docType: input.docType,
        docId: input.docId,
        attachmentId: attachment.id,
        key: input.key,
        name: input.filename,
      });
    } catch {
      /* audit is best-effort; never block the upload */
    }
  }
  return attachment;
}

export async function deleteAttachment(input: { id: string }): Promise<void> {
  const insforge = await createInsForgeServerClient();
  const { data: row, error: fetchErr } = await insforge.database
    .from("attachments")
    .select("id, bucket, key, doc_type, doc_id, filename")
    .eq("id", input.id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) return;

  const {
    bucket,
    key,
    doc_type: docType,
    doc_id: docId,
    filename,
  } = row as {
    bucket: string;
    key: string;
    doc_type: string | null;
    doc_id: string | null;
    filename: string | null;
  };
  const { error: rmErr } = await insforge.storage
    .from(bucket)
    .remove(key);
  if (rmErr) throw new Error(rmErr.message);

  const { error: delErr } = await insforge.database
    .from("attachments")
    .delete()
    .eq("id", input.id);
  if (delErr) throw new Error(delErr.message);

  // Best-effort audit event — only when the attachment was linked to a
  // concrete document. Defensive: survives even if the change-detail
  // migration has not landed yet.
  if (docType && docId) {
    try {
      await recordAttachmentRemovedEvent({
        docType,
        docId,
        attachmentId: input.id,
        key,
        name: filename,
      });
    } catch {
      /* audit is best-effort; never block the delete */
    }
  }
}

/**
 * Mint a short-lived signed download URL for an attachment. Called from
 * Server Components when rendering a download link — the URL is time-boxed
 * so it's safe to embed in HTML.
 */
export async function signedAttachmentUrl(input: {
  id: string;
  seconds?: number;
}): Promise<string | null> {
  const insforge = await createInsForgeServerClient();
  const { data: row, error: fetchErr } = await insforge.database
    .from("attachments")
    .select("id, bucket, key")
    .eq("id", input.id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) return null;
  const { bucket, key } = row as { bucket: string; key: string };

  const { data, error } = await insforge.storage
    .from(bucket)
    .createSignedUrl(key, input.seconds ?? 60);
  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}

export async function revalidateDocAttachments(input: {
  docType: string;
  docId: string;
}): Promise<void> {
  // Best-effort: revalidate the document detail page so the Attachments tab
  // picks up the new row. Callers that know a more specific path can revalidate
  // that instead.
  revalidatePath(`/(app)/[locale]`);
  void input;
}
