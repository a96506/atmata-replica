"use client";

import { toast } from "@/components/toast";

export function InvoiceDemoActions({ jobId }: { jobId: number }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="cursor-pointer rounded-md bg-status-success-muted text-status-success-foreground ring-1 ring-status-success-border px-4 py-2 text-sm font-medium transition-colors hover:bg-status-success/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => toast.success(`Approve invoice #${jobId} (demo)`)}
      >
        Approve
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md bg-destructive px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-destructive/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
        onClick={() => toast.message(`Reject invoice #${jobId} (demo)`)}
      >
        Reject
      </button>
    </div>
  );
}
