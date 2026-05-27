"use client";

import { ROLE_OPTIONS, useSession } from "@/lib/session";
import type { Role } from "@/types";

export function RoleSwitcher() {
  const { role, setRole } = useSession();

  return (
    <div className="fixed right-3 bottom-3 z-40 flex items-center gap-2 rounded-full border border-dashed border-orange-400 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm backdrop-blur">
      <span className="font-medium text-orange-700">dev · role</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
        aria-label="Switch role (dev only)"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}
