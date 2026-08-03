import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export { Skeleton };

/** Loading placeholder shaped like a document list table. */
export function SkeletonRows({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted/50 border-b px-4 py-3">
        <Skeleton className="h-3 w-24" />
      </div>
      <ul className="divide-border divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Loading placeholder shaped like a document detail screen. */
export function SkeletonDetail() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-20 rounded-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
