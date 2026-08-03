"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StaleDataPill({
  updatedAt,
  label = "Refresh",
}: {
  updatedAt: string;
  label?: string;
}) {
  const router = useRouter();
  const ts = new Date(updatedAt);
  const diffMin = Math.max(0, Math.floor((Date.now() - ts.getTime()) / 60_000));
  const text =
    diffMin < 1
      ? "Just now"
      : diffMin < 60
        ? `${diffMin} min ago`
        : diffMin < 1440
          ? `${Math.floor(diffMin / 60)} h ago`
          : `${Math.floor(diffMin / 1440)} d ago`;

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1">
      <span>Updated {text}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.refresh()}
        className="h-5 gap-1 px-1.5 text-xs"
      >
        <RotateCw className="size-3" />
        {label}
      </Button>
    </span>
  );
}
