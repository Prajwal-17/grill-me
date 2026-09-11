"use client";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PanelLeftOpen } from "lucide-react";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
import { cn } from "../../lib/cn";
import type { Profile } from "../../types/api";
import { Navigation } from "./navigation";
import { MobileNavigation } from "./mobile-navigation";
import { useAppNavigation } from "./use-app-navigation";
export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  const { collapsed, toggle, open, setOpen } = useAppNavigation();
  const reduced = useReducedMotion();
  return (
    <div className="flex h-dvh overflow-hidden">
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
        {collapsed && (
          <div className="hidden h-10 shrink-0 items-center px-2 pb-2 md:flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              aria-label="Open sidebar"
              aria-keyshortcuts="Control+b"
            >
              <PanelLeftOpen size={17} />{" "}
              <span className="text-xs">Sidebar</span>
              <KbdGroup className="ml-2" aria-label="Control plus B">
                <Kbd>Ctrl</Kbd>
                <span aria-hidden="true">+</span>
                <Kbd>B</Kbd>
              </KbdGroup>
            </Button>
          </div>
        )}
        <MobileNavigation profile={profile} open={open} setOpen={setOpen} />
        <div
          data-slot="app-content"
          className="relative min-h-0 flex-1 overflow-y-auto bg-surface md:rounded-xl md:border md:border-line"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
