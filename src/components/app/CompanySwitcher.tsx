"use client";

import { useSession } from "@/lib/session";

export function CompanySwitcher({ label }: { label: string }) {
  const { companies, companyId, setCompanyId } = useSession();

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
      <span className="sr-only">{label}</span>
      <span aria-hidden>{label}</span>
      <select
        value={companyId}
        onChange={(e) => setCompanyId(e.target.value)}
        className="cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
