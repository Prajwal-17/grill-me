"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  History,
  Plus,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { Button, buttonStyles } from "../ui/button";
import { ThemeSelect } from "../theme-provider";
import { BrandMark } from "../brand";
import { useSidebar } from "../ui/ui-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/cn";
import type { Profile } from "../../types/api";
import { AccountMenu } from "./account-menu";
function NavItem({
  label,
  children,
  collapsed,
}: {
  label: string;
  children: ReactNode;
  collapsed: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" sideOffset={12}>
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
export function Navigation({
  profile,
  collapsed = false,
  close,
}: {
  profile: Profile;
  collapsed?: boolean;
  close?: () => void;
}) {
  const pathname = usePathname();
  const { toggle } = useSidebar();
  const toggleButton = useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = useRef(false);
  const toggleWithFocus = () => {
    restoreToggleFocus.current = true;
    toggle();
  };
  useLayoutEffect(() => {
    if (restoreToggleFocus.current) {
      toggleButton.current?.focus();
      restoreToggleFocus.current = false;
    }
  }, [collapsed]);
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col py-4",
        collapsed ? "px-2.5" : "px-3",
      )}
    >
      <div
        className={cn(
          "mb-7 flex h-9 items-center",
          collapsed ? "justify-center" : "gap-2.5 px-2",
        )}
      >
        {collapsed ? (
          <NavItem collapsed label="Expand sidebar">
            <Button
              variant="ghost"
              size="icon"
              ref={toggleButton}
              onClick={toggleWithFocus}
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={17} />
            </Button>
          </NavItem>
        ) : (
          <Link
            href="/exercises"
            onClick={close}
            aria-label="Grill Me home"
            className="flex shrink-0 items-center gap-2.5 rounded-lg"
          >
            <BrandMark />
            {!collapsed && (
              <span className="text-[17px] font-semibold tracking-tight">
                Grill Me
              </span>
            )}
          </Link>
        )}
        {!collapsed && !close && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="ml-auto"
            ref={toggleButton}
            onClick={toggleWithFocus}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </Button>
        )}
      </div>
      <NavItem label="New exercise" collapsed={collapsed}>
        <Link
          href="/chat?new=1"
          onClick={close}
          aria-label="New exercise"
          className={cn(buttonStyles("primary"), "mb-5", collapsed && "px-0")}
        >
          <Plus size={16} />
          {!collapsed && "New exercise"}
        </Link>
      </NavItem>
      <nav aria-label="Main navigation" className="grid gap-1">
        {[
          {
            href: "/exercises",
            label: "Exercises",
            icon: BookOpen,
            active: pathname === "/exercises" || pathname === "/chat",
          },
          {
            href: "/history",
            label: "History",
            icon: History,
            active: pathname === "/history",
          },
          {
            href: "/preferences",
            label: "Preferences",
            icon: Settings2,
            active: pathname === "/preferences",
          },
        ].map(({ href, label, icon: Icon, active }) => (
          <NavItem key={href} label={label} collapsed={collapsed}>
            <Link
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onClick={close}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm outline-offset-2",
                active
                  ? "font-medium text-foreground"
                  : "text-muted hover:bg-elevated/60 hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active && (
                <motion.span
                  layoutId={close ? "mobile-nav" : "desktop-nav"}
                  className="absolute inset-0 rounded-lg border border-line bg-surface shadow-xs"
                  transition={{ duration: 0.18 }}
                />
              )}
              <Icon size={17} strokeWidth={1.6} className="relative shrink-0" />
              {!collapsed && <span className="relative">{label}</span>}
            </Link>
          </NavItem>
        ))}
      </nav>
      <div className="mt-auto grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 pt-8">
        <ThemeSelect compact={collapsed} />
        <AccountMenu profile={profile} collapsed={collapsed} close={close} />
      </div>
    </div>
  );
}
