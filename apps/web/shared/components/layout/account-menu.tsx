"use client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useAppStore } from "@/shared/stores/app-store";
import { cn } from "@/shared/lib/cn";
import type { Profile } from "@/shared/types/api";
export function AccountMenu({
  profile,
  collapsed = false,
  close,
}: {
  profile: Profile;
  collapsed?: boolean;
  close?: () => void;
}) {
  const router = useRouter();
  const queries = useQueryClient();
  const clearProfile = useAppStore((state) => state.clearProfile);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-12 min-w-0 w-full justify-start px-2 text-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label="Account"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-xs font-medium">
            {profile.email.charAt(0).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span
                className="min-w-0 flex-1 truncate text-left text-xs text-muted"
                title={profile.email}
              >
                {profile.email}
              </span>
              <ChevronDown size={13} className="ml-auto shrink-0 text-muted" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align="start"
        className="w-64"
      >
        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted">
          <UserRound size={14} />
          <span className="truncate">{profile.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            clearProfile();
            queries.clear();
            close?.();
            router.replace("/");
          }}
        >
          <LogOut size={15} />
          Change profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
