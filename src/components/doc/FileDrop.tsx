"use client";

import * as React from "react";
import { toast } from "@/components/toast";
import { insforge } from "@/lib/insforge/client";

export type DroppedFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  progress: number;
  /** Storage object key — present after a successful upload. */
  key?: string;
  /** Signed URL returned by the upload — present after a successful upload. */
  url?: string;
  /** Error message if the upload failed. */
  error?: string;
};

export type FileDropProps = {
  accept?: string;
  maxSizeMb?: number;
  /** Storage bucket: `documents` (user attachments) or `imports` (CSV/PDF ingest). */
  bucket?: "documents" | "imports";
  /**
   * Path prefix for the storage key, e.g. `${companyId}/${docType}/${docId}`.
   * The first segment MUST be the caller's company id — storage RLS enforces
   * `(storage.foldername(key))[1] = my_company_id()`.
   */
  pathPrefix?: string;
  /** Called after each successful upload with the full DroppedFile (incl. key + url). */
  onAccept?: (file: DroppedFile) => void;
  label?: string;
  hint?: string;
};

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(name: string): string {
  // Strip path separators and unsafe chars; keep unicode (Arabic) letters.
  return name.replace(/[/\\]/g, "_").replace(/[^\p{L}\p{N}._-]/gu, "_");
}

export function FileDrop({
  accept = "application/pdf,image/*",
  maxSizeMb = 10,
  bucket = "documents",
  pathPrefix = "",
  onAccept,
  label = "Drop file or click to browse",
  hint = "PDF / image · max 10 MB",
}: FileDropProps) {
  const [dragOver, setDragOver] = React.useState(false);
  const [files, setFiles] = React.useState<DroppedFile[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = React.useCallback(
    async (file: File) => {
      if (!pathPrefix) {
        toast.error("FileDrop missing pathPrefix — cannot upload.");
        return;
      }
      const item: DroppedFile = {
        id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        mime: file.type,
        progress: 0,
      };
      setFiles((prev) => [...prev, item]);

      const objectKey = `${pathPrefix}/${item.id}/${safeFileName(file.name)}`;
      const { data, error } = await insforge.storage
        .from(bucket)
        .upload(objectKey, file);

      setFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? error
              ? {
                  ...f,
                  progress: 0,
                  error: error.message,
                }
              : {
                  ...f,
                  progress: 100,
                  key: data?.key,
                  url: data?.url,
                }
            : f,
        ),
      );

      if (error) {
        toast.error(`Upload failed: ${error.message}`);
        return;
      }
      toast.success(`Uploaded: ${file.name}`);
      onAccept?.({
        ...item,
        progress: 100,
        key: data?.key,
        url: data?.url,
      });
    },
    [bucket, pathPrefix, onAccept],
  );

  const accepted = React.useCallback(
    (file: File) => {
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`File too large (max ${maxSizeMb} MB).`);
        return;
      }
      if (files.some((f) => f.name === file.name && f.size === file.size && f.progress < 100)) {
        toast.warning(`Already uploading: ${file.name}`);
        return;
      }
      void upload(file);
    },
    [files, maxSizeMb, upload],
  );

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i);
      if (f) accepted(f);
    }
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="filedrop-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-8 text-center transition-colors " +
          (dragOver
            ? "border-primary bg-primary/10"
            : "border-input bg-card hover:border-ring")
        }
      >
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <input
          id="filedrop-input"
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {humanSize(f.size)} · {f.mime || "unknown"}
                </div>
                {f.error ? (
                  <div className="mt-1 text-xs text-destructive">{f.error}</div>
                ) : f.progress < 100 ? (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: "40%" }}
                    />
                  </div>
                ) : null}
              </div>
              <span
                className={
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                  (f.error
                    ? "bg-status-danger-muted text-destructive"
                    : f.progress >= 100
                      ? "bg-status-success-muted text-status-success-foreground"
                      : "bg-status-pending-muted text-status-pending-foreground")
                }
              >
                {f.error
                  ? "failed"
                  : f.progress >= 100
                    ? "uploaded"
                    : "uploading"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
