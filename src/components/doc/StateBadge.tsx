import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Document lifecycle badge.
 *
 * States map onto the four semantic status tokens defined in `globals.css`
 * rather than raw palette colours, so every badge stays legible in both light
 * and dark themes and the vocabulary is consistent across modules.
 */
type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "strong";

const STATE_TONE: Record<string, Tone> = {
  // in progress
  draft: "neutral",
  pending: "warning",
  review: "warning",
  confirmed: "info",
  // settled
  posted: "success",
  accepted: "success",
  matched: "success",
  // terminal / problem
  cancelled: "danger",
  discrepancy: "danger",
  expired: "neutral",
  archived: "neutral",
  locked: "strong",
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-status-info-muted text-status-info-foreground border-transparent",
  success: "bg-status-success-muted text-status-success-foreground border-transparent",
  warning: "bg-status-pending-muted text-status-pending-foreground border-transparent",
  danger: "bg-status-danger-muted text-status-danger-foreground border-transparent",
  strong: "bg-foreground text-background border-transparent",
};

export function StateBadge({
  state,
  className,
}: {
  state: string;
  className?: string;
}) {
  const tone = STATE_TONE[state] ?? "neutral";

  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-medium", TONE_CLASS[tone], className)}
    >
      {state.replace(/_/g, " ")}
    </Badge>
  );
}
