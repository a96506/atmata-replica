import Link from "next/link";

export type RelatedDocLink = {
  label: string;
  href: string;
  badge?: string | null;
};

export type RelatedDocsGroup = {
  groupLabel: string;
  links: RelatedDocLink[];
  count?: number;
};

export type RelatedDocsProps = {
  groups: RelatedDocsGroup[];
  title?: string;
  emptyLabel?: string;
};

export function RelatedDocs({
  groups,
  title = "Related documents",
  emptyLabel = "—",
}: RelatedDocsProps) {
  return (
    <aside className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      <ul className="space-y-3 text-sm">
        {groups.map((g) => (
          <li key={g.groupLabel}>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g.groupLabel}
              {typeof g.count === "number" ? ` (${g.count})` : null}
            </div>
            {g.links.length === 0 ? (
              <div className="mt-1 text-xs text-muted-foreground">{emptyLabel}</div>
            ) : (
              <ul className="mt-1 space-y-1">
                {g.links.map((l) => (
                  <li
                    key={`${g.groupLabel}-${l.href}-${l.label}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <Link
                      href={l.href}
                      className="truncate text-primary hover:underline"
                    >
                      {l.label}
                    </Link>
                    {l.badge ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                        {l.badge}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
