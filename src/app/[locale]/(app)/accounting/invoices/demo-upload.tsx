"use client";

import * as React from "react";
import { toast } from "@/components/toast";
import { insforge } from "@/lib/insforge/client";
import { createOcrJob, linkOcrJobSource } from "@/lib/actions/invoices";
import { requestVendorBillOcr } from "@/lib/actions/ai";
import { useActionToast } from "@/hooks/use-action-toast";

function safeFileName(name: string): string {
  return name.replace(/[/\\]/g, "_").replace(/[^\p{L}\p{N}._-]/gu, "_");
}

/**
 * InvoiceUpload — AP invoice PDF ingest. Two-step flow:
 *   1. createOcrJob Server Action → { jobId, companyId }
 *   2. browser uploads PDF to `imports` bucket at
 *      `${companyId}/vendor_bills/${jobId}/${filename}`
 *   3. linkOcrJobSource Server Action → updates job + inserts attachment row
 *
 * The OCR extraction edge function (functions todo) later picks up the
 * queued job and fills `extraction` / `confidence` / `matched_doc_id`.
 */
export function DemoUpload() {
  const [uploading, setUploading] = React.useState(false);
  const actionToast = useActionToast();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50 MB).");
      return;
    }
    setUploading(true);
    try {
      const { jobId, companyId } = await createOcrJob({
        fileName: file.name,
        mime: file.type || "application/pdf",
        size: file.size,
      });
      const objectKey = `${companyId}/vendor_bills/${jobId}/${safeFileName(file.name)}`;
      const { data, error } = await insforge.storage
        .from("imports")
        .upload(objectKey, file);
      if (error) throw new Error(error.message);
      await linkOcrJobSource({
        jobId,
        key: data?.key ?? objectKey,
        url: data?.url ?? "",
        mime: file.type || "application/pdf",
        size: file.size,
        filename: file.name,
      });
      // Trigger the OCR edge function now that the source is linked. The job
      // stays "queued" until the function completes; OCR runs async, so the
      // upload success toast is shown regardless of this call's outcome.
      const ocr = await requestVendorBillOcr(jobId);
      if (!ocr.ok) actionToast.error(ocr.error);
      toast.success(`Uploaded ${file.name} — OCR queued.`);
      // Reload so the new job appears in the list.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const file = fd.get("file") as File | null;
        void onFile(file ?? undefined);
        e.currentTarget.reset();
      }}
    >
      <input
        type="file"
        name="file"
        accept=".pdf,.png,.jpg,.jpeg"
        disabled={uploading}
        className="flex-1 text-sm text-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/10 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={uploading}
        className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
