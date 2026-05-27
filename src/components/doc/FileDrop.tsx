"use client";

import * as React from "react";
import { toast } from "@/components/toast";

export type DroppedFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  progress: number;
};

export type FileDropProps = {
  accept?: string;
  maxSizeMb?: number;
  onAccept?: (file: DroppedFile) => void;
  label?: string;
  hint?: string;
};

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDrop({
  accept = "application/pdf,image/*",
  maxSizeMb = 10,
  onAccept,
  label = "Drop file or click to browse",
  hint = "PDF / image · max 10 MB",
}: FileDropProps) {
  const [dragOver, setDragOver] = React.useState(false);
  const [files, setFiles] = React.useState<DroppedFile[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const accepted = React.useCallback(
    (file: File) => {
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`File too large (max ${maxSizeMb} MB).`);
        return;
      }
      if (files.some((f) => f.name === file.name && f.size === file.size)) {
        toast.warning(`Duplicate file ignored: ${file.name}`);
        return;
      }
      const item: DroppedFile = {
        id: `f_${Date.now()}_${Math.random()}`,
        name: file.name,
        size: file.size,
        mime: file.type,
        progress: 0,
      };
      setFiles((prev) => [...prev, item]);
      // Fake progress
      let p = 0;
      const tick = setInterval(() => {
        p += Math.random() * 22;
        if (p >= 100) {
          p = 100;
          clearInterval(tick);
          toast.success(`Uploaded (demo): ${file.name}`);
          onAccept?.(item);
        }
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, progress: Math.min(100, p) } : f)),
        );
      }, 250);
    },
    [files, maxSizeMb, onAccept],
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
            ? "border-orange-500 bg-orange-50"
            : "border-slate-300 bg-white hover:border-slate-400")
        }
      >
        <span className="text-sm font-medium text-slate-900">{label}</span>
        <span className="text-xs text-slate-500">{hint}</span>
        <span className="mt-1 text-xs text-slate-400">
          Demo · files are not actually uploaded.
        </span>
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
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">
                  {humanSize(f.size)} · {f.mime || "unknown"}
                </div>
                {f.progress < 100 ? (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-orange-500 transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                ) : null}
              </div>
              <span
                className={
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                  (f.progress >= 100
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-900")
                }
              >
                {f.progress >= 100 ? "uploaded" : `${Math.floor(f.progress)}%`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
