import { Check } from "lucide-react";
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

/**
 * Lifecycle stepper for a document. Completed steps collapse to a check so the
 * current stage is the clear focal point, and connectors use logical margins so
 * the whole track mirrors correctly under RTL.
 */
export function StatusTimeline({
  states,
  current,
  className,
}: StatusTimelineProps) {
  const currentIdx = states.findIndex((s) => s.id === current);

  return (
    <ol
      className={cn("flex flex-wrap items-center gap-y-2", className)}
      aria-label="Document state"
    >
      {states.map((step, index) => {
        const isDone = index < currentIdx;
        const isActive = index === currentIdx;

        return (
          <li key={step.id} className="flex items-center">
            <span
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full py-1 text-xs font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground px-2.5"
                  : isDone
                    ? "text-muted-foreground px-2"
                    : "text-muted-foreground/60 px-2",
              )}
            >
              {isDone ? (
                <Check className="size-3 shrink-0" aria-hidden />
              ) : null}
              {step.label}
            </span>

            {index < states.length - 1 ? (
              <span
                className={cn(
                  "mx-1 h-px w-4 shrink-0",
                  isDone ? "bg-primary/40" : "bg-border",
                )}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
