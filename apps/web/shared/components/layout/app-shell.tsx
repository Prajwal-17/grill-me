"use client";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Kbd, KbdGroup } from "@/shared/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/cn";
import type { Profile } from "@/shared/types/api";
import { Navigation } from "@/shared/components/layout/navigation";
import { MobileNavigation } from "@/shared/components/layout/mobile-navigation";
import { useAppNavigation } from "@/shared/components/layout/use-app-navigation";
export function AppShell({
  profile,
  children,
  contentScrollable = true,
}: {
  profile: Profile;
  children: ReactNode;
  contentScrollable?: boolean;
}) {
  const { collapsed, toggle, open, setOpen } = useAppNavigation();
  const reduced = useReducedMotion();
  return (
    <div
      className="group/shell flex h-dvh overflow-hidden"
      data-sidebar-collapsed={collapsed}
    >
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 0 : 232 }}
        transition={
          reduced
            ? { duration: 0 }
            : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
        }
        className="sticky top-0 hidden h-dvh shrink-0 overflow-x-clip md:block"
        aria-label="Sidebar"
        inert={collapsed}
        aria-hidden={collapsed}
      >
        <div className="h-full w-[232px]">
          <Navigation profile={profile} />
        </div>
      </motion.aside>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col md:py-2 md:pr-2",
          collapsed && "md:pl-2",
        )}
      >
        <MobileNavigation profile={profile} open={open} setOpen={setOpen} />
        <div
          data-slot="app-content"
          className={cn(
            "relative min-h-0 flex-1 bg-surface md:rounded-xl md:border md:border-line",
            contentScrollable ? "overflow-y-auto" : "overflow-hidden",
          )}
        >
          {collapsed && (
            <div className="absolute left-2 top-2 z-40 hidden md:block">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggle}
                    aria-label="Open sidebar"
                    aria-keyshortcuts="Control+b"
                    className="bg-surface/90 shadow-xs backdrop-blur-sm"
                  >
                    <PanelLeftOpen size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="flex items-center gap-2"
                >
                  <span>Open sidebar</span>
                  <KbdGroup aria-label="Control plus B">
                    <Kbd>Ctrl</Kbd>
                    <span aria-hidden="true">+</span>
                    <Kbd>B</Kbd>
                  </KbdGroup>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
