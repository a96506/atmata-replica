"use client";

import { toast } from "@/components/toast";

export function DemoStartSession() {
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("Session start is disabled in UI-only mode.");
      }}
    >
      <div className="flex-1">
        <label htmlFor="journal_id" className="mb-1 block text-sm font-medium text-foreground">
          Journal ID
        </label>
        <input
          id="journal_id"
          name="journal_id"
          type="number"
          min={1}
          placeholder="e.g. 7"
          className="w-full rounded-md border border-input px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Start session
      </button>
    </form>
  );
}
