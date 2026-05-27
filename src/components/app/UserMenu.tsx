"use client";

import * as React from "react";
import { DropdownMenu } from "radix-ui";
import { useSession } from "@/lib/session";
import { useRouter } from "@/i18n/navigation";

export function UserMenu({ signOutLabel }: { signOutLabel: string }) {
  const { user, role, signOut } = useSession();
  const router = useRouter();
  const initials = user.name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          aria-label={user.name}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-800">
            {initials}
          </span>
          <span className="hidden md:inline">{user.name}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[220px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-slate-900">{user.name}</div>
            <div className="text-xs text-slate-500">{user.email}</div>
            <div className="mt-1 text-xs text-slate-500">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                {role}
              </span>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item
            onSelect={() => {
              signOut();
              router.push("/login");
            }}
            className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-900 outline-none data-[highlighted]:bg-slate-100"
          >
            {signOutLabel}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
