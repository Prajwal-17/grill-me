"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  History,
  LogOut,
  Menu,
  Plus,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, buttonStyles } from "./ui/button";
import { ThemeSelect } from "./theme-provider";
import { clearProfile } from "../../features/profile/lib/profile-storage";
import { BrandMark } from "./brand";
import { useSidebar } from "./ui/ui-provider";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "./ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/cn";
import type { Profile } from "../types/api";

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
function Navigation({
  profile,
  collapsed = false,
  close,
}: {
  profile: Profile;
  collapsed?: boolean;
  close?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queries = useQueryClient();
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
      className={cn("flex h-full flex-col py-4", collapsed ? "px-2.5" : "px-3")}
    >
      <div
        className={cn(
          "mb-7 flex h-9 items-center",
          collapsed ? "justify-center" : "gap-2.5 px-2",
        )}
      >
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
      {collapsed && (
        <NavItem collapsed label="Expand sidebar">
          <Button
            className="mt-5"
            variant="ghost"
            size="icon"
            ref={toggleButton}
            onClick={toggleWithFocus}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={17} />
          </Button>
        </NavItem>
      )}
      <div className="mt-auto grid gap-2 pt-8">
        <ThemeSelect compact={collapsed} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "h-12 w-full justify-start px-2 text-foreground",
                collapsed && "justify-center px-0",
              )}
              aria-label="Account"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-xs font-medium">
                {profile.email.charAt(0).toUpperCase()}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 truncate text-xs text-muted">
                    {profile.email}
                  </span>
                  <ChevronDown
                    size={13}
                    className="ml-auto shrink-0 text-muted"
                  />
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
      </div>
    </div>
  );
}
export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  const { collapsed } = useSidebar();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = matchMedia("(min-width: 768px)");
    const update = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <div className="flex min-h-dvh">
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 64 : 232 }}
        transition={
          reduced
            ? { duration: 0 }
            : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
        }
        className="sticky top-0 hidden h-dvh shrink-0 overflow-x-clip md:block"
        aria-label="Sidebar"
      >
        <Navigation profile={profile} collapsed={collapsed} />
      </motion.aside>
      <div className="min-w-0 flex-1 md:py-2 md:pr-2">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 md:hidden">
          <Link
            href="/exercises"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <BrandMark className="size-7" />
            Grill Me
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu size={19} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[280px] gap-0 border-r border-line bg-canvas p-0"
              aria-describedby={undefined}
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Navigate Grill Me
              </SheetDescription>
              <Navigation profile={profile} close={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <div className="min-h-[calc(100dvh-56px)] bg-surface md:min-h-[calc(100dvh-16px)] md:rounded-xl md:border md:border-line">
          {children}
        </div>
      </div>
    </div>
  );
}
