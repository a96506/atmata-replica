"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { useSession } from "@/lib/session";
import { signOutAction } from "@/lib/actions/auth";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ signOutLabel }: { signOutLabel: string }) {
  const { user, roles } = useSession();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const initials = user.name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-1.5"
          aria-label={user.name}
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[14ch] truncate text-sm lg:inline">
            {user.name}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-muted-foreground text-xs">{user.email}</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {roles.map((role) => (
                <Badge
                  key={role}
                  variant="secondary"
                  className="font-mono text-[10px]"
                >
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={pending}
          onSelect={() => {
            startTransition(async () => {
              await signOutAction();
              router.replace("/login");
              router.refresh();
            });
          }}
        >
          <LogOut data-icon="inline-start" />
          {signOutLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
