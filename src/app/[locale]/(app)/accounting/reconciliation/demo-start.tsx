"use client";

import { toast } from "@/components/toast";

export function DemoStartSession() {
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("Session start is disabled in UI-only mode.");
      }}
    >
      <div className="flex-1">
        <label htmlFor="journal_id" className="mb-1 block text-sm font-medium text-slate-800">
          Journal ID
        </label>
        <input
          id="journal_id"
          name="journal_id"
          type="number"
          min={1}
          placeholder="e.g. 7"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="cursor-pointer rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        Start session
      </button>
    </form>
  );
}
