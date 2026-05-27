import { cn } from "@/lib/utils";

export type StatusTimelineStep = {
  id: string;
  label: string;
};

export type StatusTimelineProps = {
  states: StatusTimelineStep[];
  current: string;
  className?: string;
};

export function StatusTimeline({ states, current, className }: StatusTimelineProps) {
  const currentIdx = states.findIndex((s) => s.id === current);
  return (
    <ol
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label="Document state"
    >
      {states.map((s, i) => {
        const reached = i <= currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                active && "bg-orange-500 text-white",
                !active && reached && "bg-orange-100 text-orange-900",
                !reached && "bg-slate-100 text-slate-500",
              )}
            >
              {s.label}
            </span>
            {i < states.length - 1 && (
              <span
                className={cn(
                  "h-px w-4",
                  reached && i < currentIdx ? "bg-orange-300" : "bg-slate-300",
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
