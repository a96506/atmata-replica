import { Link } from "@/i18n/navigation";

export type ModuleSubnavItem = {
  href: string;
  label: string;
};

export function ModuleSubnav({ items }: { items: ModuleSubnavItem[] }) {
  return (
    <nav
      aria-label="Module sub-navigation"
      className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:-mx-6 md:px-6"
    >
      {items.map((it) => (
        <Link
          key={it.href}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={it.href as any}
          className="cursor-pointer rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
