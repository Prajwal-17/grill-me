import { Link } from "react-router";
import type { ReactNode } from "react";
import type { Profile } from "@/shared/types/api";
import { Settings2, SlidersHorizontal } from "lucide-react";
import { BrandLockup } from "@/shared/components/brand";
import { AccountMenu } from "@/shared/components/layout/account-menu";
import { DesktopVersionLink } from "@/shared/components/layout/desktop-version";
import { GenerationActivity } from "@/features/generations/components/generation-activity";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { ProviderHealthNotice } from "@/features/settings/provider-health";

export function CompactShell({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  return (
    <div className="workspace-frame flex h-dvh flex-col overflow-hidden bg-canvas">
      <a
        href="#app-content"
        className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-lg bg-foreground px-4 py-2 text-ui text-canvas focus:translate-y-0"
      >
        Skip to content
      </a>
      <header
        data-slot="page-header"
        className="workspace-toolbar flex min-h-[var(--workspace-header-height)] shrink-0 items-center gap-3 border-b border-line px-4"
      >
        <Link
          to="/"
          aria-label="Grill Me home"
          className="inline-flex shrink-0 items-center"
        >
          <BrandLockup markClassName="size-7" wordmarkClassName="text-ui" />
        </Link>
        <div
          data-slot="header-actions"
          className="ml-auto flex shrink-0 items-center gap-1"
        >
          <DesktopVersionLink />
          <GenerationActivity />
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/preferences"
                aria-label="Preferences"
                className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                <SlidersHorizontal size={16} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              Preferences
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/settings"
                aria-label="Settings"
                className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                <Settings2 size={16} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              Settings
            </TooltipContent>
          </Tooltip>
          <div className="w-9 shrink-0">
            <AccountMenu profile={profile} collapsed placement="bottom" />
          </div>
        </div>
      </header>
      <ProviderHealthNotice />
      <div
        id="app-content"
        tabIndex={-1}
        className="min-h-0 flex-1 outline-none"
      >
        {children}
      </div>
    </div>
  );
}
