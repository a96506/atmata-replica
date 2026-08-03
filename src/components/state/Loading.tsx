import { Spinner } from "@/components/ui/spinner";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground bg-card flex items-center justify-center gap-2 rounded-lg border p-10 text-sm"
    >
      <Spinner />
      {label}
    </div>
  );
}
