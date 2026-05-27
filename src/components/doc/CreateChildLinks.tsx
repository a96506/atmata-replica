import Link from "next/link";

export type CreateChildLink = {
  label: string;
  href: string;
};

export function CreateChildLinks({ links }: { links: CreateChildLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Quick actions
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50 hover:text-orange-700"
          >
            + {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function NewDocButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex cursor-pointer items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
    >
      + {label}
    </Link>
  );
}
