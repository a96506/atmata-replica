"use client";

import { LogOut } from "lucide-react";
import { ROLE_OPTIONS, useSession } from "@/lib/session";
import { useRouter } from "@/i18n/navigation";
import type { Role } from "@/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ signOutLabel }: { signOutLabel: string }) {
  const { user, role, setRole, signOut } = useSession();
  const router = useRouter();

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
            <Badge variant="secondary" className="mt-1 w-fit font-mono text-[10px]">
              {role}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Role impersonation is a demo affordance; it previously floated over
            page content as a fixed pill. Nested here it stays discoverable
            without covering table cells. */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Switch role</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              <DropdownMenuRadioGroup
                value={role}
                onValueChange={(value) => setRole(value as Role)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option}
                    value={option}
                    className="font-mono text-xs"
                  >
                    {option}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              signOut();
              router.push("/login");
            }}
          >
            <LogOut data-icon="inline-start" />
            {signOutLabel}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
