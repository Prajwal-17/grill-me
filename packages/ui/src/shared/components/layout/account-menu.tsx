import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  getPreferences,
  preferencesKey,
} from "@/features/profile/api/profile-api";
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
  const navigate = useNavigate();
  const preferences = useQuery({
    queryKey: preferencesKey(profile.id),
    queryFn: () => getPreferences(profile.id),
    staleTime: 60_000,
  });
  const name = preferences.data?.displayName || profile.email;
  const queries = useQueryClient();
  const clearProfile = useAppStore((state) => state.clearProfile);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-9 min-w-0 w-full justify-start px-2 text-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label="Account"
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface text-metadata font-medium">
            {name.charAt(0).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span
                className="min-w-0 flex-1 truncate text-left text-metadata text-foreground"
                title={name}
              >
                {name}
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
        <DropdownMenuLabel className="flex items-center gap-2 text-metadata font-normal text-muted">
          <UserRound size={14} />
          <span className="truncate">{name}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            clearProfile();
            queries.clear();
            close?.();
            navigate("/", { replace: true });
          }}
        >
          <LogOut size={15} />
          Change profile
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
