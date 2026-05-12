"use client";

import { toast } from "@/components/toast";

export function InvoiceDemoActions({ jobId }: { jobId: number }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="cursor-pointer rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        onClick={() => toast.success(`Approve invoice #${jobId} (demo)`)}
      >
        Approve
      </button>
      <button
        type="button"
        className="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        onClick={() => toast.message(`Reject invoice #${jobId} (demo)`)}
      >
        Reject
      </button>
    </div>
  );
}
