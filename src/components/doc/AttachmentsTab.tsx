"use client";

import * as React from "react";
import { FileDrop, type DroppedFile } from "./FileDrop";
import { toast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import {
  ATTACHMENTS_PAGE_SIZE,
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
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const confirm = useConfirm();
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  const pageSize = ATTACHMENTS_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const refresh = React.useCallback(
    async (pageNum: number) => {
      const offset = (pageNum - 1) * pageSize;
      const result = await listAttachments({
        docType,
        docId,
        limit: pageSize,
        offset,
      });
      setAttachments(result.items);
      setTotal(result.total);
      setPage(pageNum);
    },
    [docType, docId, pageSize],
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await refresh(1);
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

  const goToPage = React.useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        await refresh(nextPage);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

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
        // Reload page 1 so the new upload is visible.
        setLoading(true);
        try {
          await refresh(1);
        } finally {
          setLoading(false);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [docType, docId, companyId, refresh],
  );

  const onDelete = React.useCallback(
    async (attachment: Attachment) => {
      const ok = await confirm({
        title: "Delete attachment?",
        description:
          "This removes the file from storage and records an audit event. This cannot be undone.",
        confirmLabel: "Delete",
        cancelLabel: "Keep",
        tone: "destructive",
      });
      if (!ok) return;
      setPendingDelete(attachment.id);
      try {
        await deleteAttachment({ id: attachment.id });
        // Re-fetch current page from server (may shrink if last item on page).
        const nextTotal = Math.max(0, total - 1);
        const nextPageCount = Math.max(1, Math.ceil(nextTotal / pageSize));
        const targetPage = Math.min(page, nextPageCount);
        await refresh(targetPage);
        toast.success("Attachment deleted.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingDelete(null);
      }
    },
    [confirm, page, pageSize, refresh, total],
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

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const showPager = total > pageSize || page > 1;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Existing attachments
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : attachments.length > 0 ? (
          <>
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
                    onClick={() => onDelete(a)}
                    disabled={pendingDelete === a.id}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {pendingDelete === a.id ? "Deleting…" : "Delete"}
                  </button>
                </li>
              ))}
            </ul>
            {showPager ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {from}–{to} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => void goToPage(page - 1)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= pageCount || loading}
                    onClick={() => void goToPage(page + 1)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
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
