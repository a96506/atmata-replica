"use client";

import { toast } from "@/components/toast";

export function DemoUpload() {
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        toast.message("Upload is disabled in UI-only mode.");
      }}
    >
      <input
        type="file"
        name="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="flex-1 text-sm text-slate-800 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-orange-800 hover:file:bg-orange-100"
      />
      <button
        type="submit"
        className="cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        Upload
      </button>
    </form>
  );
}
