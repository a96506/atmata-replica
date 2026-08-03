"use client";

import { toast } from "@/components/toast";

export function DemoUpload() {
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        toast.message("Upload is disabled in UI-only mode.");
      }}
    >
      <input
        type="file"
        name="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="flex-1 text-sm text-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/10"
      />
      <button
        type="submit"
        className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Upload
      </button>
    </form>
  );
}
