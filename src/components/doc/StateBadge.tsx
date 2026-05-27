import { cn } from "@/lib/utils";

const STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-sky-100 text-sky-900",
  posted: "bg-emerald-100 text-emerald-900",
  locked: "bg-slate-800 text-white",
  archived: "bg-slate-300 text-slate-700",
  cancelled: "bg-red-100 text-red-800",
  accepted: "bg-emerald-100 text-emerald-900",
  expired: "bg-slate-200 text-slate-600",
  matched: "bg-emerald-100 text-emerald-900",
  discrepancy: "bg-red-100 text-red-800",
  review: "bg-amber-100 text-amber-900",
};

export function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STYLE[state] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {state.replace(/_/g, " ")}
    </span>
  );
}
