"use client";

import * as React from "react";
import { FileDrop, type DroppedFile } from "./FileDrop";

export type SeedAttachment = {
  name: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
};

export function AttachmentsTab({
  seedAttachments = [],
}: {
  seedAttachments?: SeedAttachment[];
}) {
  const [_dropped, setDropped] = React.useState<DroppedFile[]>([]);

  return (
    <div className="space-y-4">
      {seedAttachments.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Existing attachments
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {seedAttachments.map((a) => (
              <li key={a.name} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-slate-500">
                    {a.uploadedBy} · {a.uploadedAt}
                  </div>
                </div>
                <span className="text-xs text-slate-500">
                  {(a.size / 1024).toFixed(1)} KB
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-sm text-slate-500">No attachments yet.</div>
      )}

      <FileDrop
        label="Add attachment"
        hint="PDF / image · receipts, photos, signed copies"
        onAccept={(f) => setDropped((prev) => [...prev, f])}
      />
    </div>
  );
}
