"use client";

import * as React from "react";
import { FileDrop, type DroppedFile } from "./FileDrop";
import { toast } from "@/components/toast";
import {
  deleteAttachment,
  insertAttachment,
  listAttachments,
  signedAttachmentUrl,
} from "@/lib/actions/storage";
import type { Attachment } from "@/types/entities";

export type AttachmentsTabProps = {
  docType: string;
  docId: string;
};

function humanSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortUser(id: string | null) {
  if (!id) return "—";
  return id.slice(0, 8);
}

export function AttachmentsTab({ docType, docId }: AttachmentsTabProps) {
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [companyId, setCompanyId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const list = await listAttachments({ docType, docId });
    setAttachments(list);
  }, [docType, docId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Fetch the caller's company id once for the upload path prefix. The
  // my_company_id() RPC is the same predicate RLS uses, so the prefix is
  // guaranteed to match what storage RLS expects.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { insforge } = await import("@/lib/insforge/client");
        const { data, error } = await insforge.database.rpc("my_company_id");
        if (!cancelled && !error) setCompanyId(data as unknown as string);
      } catch {
        /* swallow — upload will surface a clearer error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onAccept = React.useCallback(
    async (file: DroppedFile) => {
      if (!file.key || !file.url || !companyId) return;
      try {
        await insertAttachment({
          docType,
          docId,
          bucket: "documents",
          key: file.key,
          url: file.url,
          mime: file.mime,
          size: file.size,
          filename: file.name,
        });
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [docType, docId, companyId, refresh],
  );

  const onDelete = React.useCallback(
    async (id: string) => {
      try {
        await deleteAttachment({ id });
        setAttachments((prev) => prev.filter((a) => a.id !== id));
        toast.success("Attachment deleted.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const onDownload = React.useCallback(async (id: string) => {
    try {
      const url = await signedAttachmentUrl({ id, seconds: 60 });
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const pathPrefix = companyId
    ? `${companyId}/${docType}/${docId}`
    : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Existing attachments
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : attachments.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onDownload(a.id)}
                    className="block truncate text-left font-medium text-primary hover:underline"
                    title={a.filename ?? a.key}
                  >
                    {a.filename ?? a.key.split("/").pop()}
                  </button>
                  <div className="text-xs text-muted-foreground">
                    {shortUser(a.uploadedBy)} · {formatDate(a.createdAt)} ·{" "}
                    {humanSize(a.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-muted-foreground">
            No attachments yet.
          </div>
        )}
      </div>

      {pathPrefix ? (
        <FileDrop
          bucket="documents"
          pathPrefix={pathPrefix}
          label="Add attachment"
          hint="PDF / image · receipts, photos, signed copies"
          onAccept={onAccept}
        />
      ) : (
        <div className="text-sm text-muted-foreground">
          Sign in to upload attachments.
        </div>
      )}
    </div>
  );
}
