import { Link, useLocation } from "react-router";
import {
  BookOpen,
  ListChecks,
  History,
  ScrollText,
  House,
  Plus,
  Settings2,
  PanelLeftClose,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { BrandLockup } from "@/shared/components/brand";
import { cn } from "@/shared/lib/cn";
import type { Profile } from "@/shared/types/api";
import { AccountMenu } from "./account-menu";

export function Navigation({
  profile,
  close,
  onCollapse,
}: {
  profile: Profile;
  close?: () => void;
  onCollapse?: () => void;
}) {
  const { pathname } = useLocation();
  const mainLinks = [
    { href: "/", label: "Home", icon: House, active: pathname === "/" },
    {
      href: "/challenges",
      label: "Challenges",
      icon: BookOpen,
      active: pathname === "/challenges" || pathname === "/chat",
    },
    {
      href: "/quizzes",
      label: "Quizzes",
      icon: ListChecks,
      active: pathname === "/quizzes",
    },
    {
      href: "/preferences",
      label: "Preferences",
      icon: SlidersHorizontal,
      active: pathname === "/preferences",
    },
  ];
  const utilityLinks = [
    {
      href: "/history",
      label: "History",
      icon: History,
      active: pathname === "/history",
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings2,
      active: pathname === "/settings",
    },
    {
      href: "/logs",
      label: "Logs",
      icon: ScrollText,
      active: pathname === "/logs" || pathname.startsWith("/logs/"),
    },
  ];
  const renderLink = ({
    href,
    label,
    icon: Icon,
    active,
  }: (typeof mainLinks)[number]) => {
    return (
      <li key={href}>
        <Link
          to={href}
          onClick={close}
          aria-current={active ? "page" : undefined}
          className={cn(
            "sidebar-nav-item flex items-center gap-2.5 rounded-md px-2.5 transition-colors duration-100",
            active
              ? "bg-nav-active font-medium text-nav-active-foreground"
              : "text-muted hover:bg-elevated hover:text-foreground",
          )}
        >
          <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
          {label}
        </Link>
      </li>
    );
  };
  return (
    <div className="workspace-navigation flex h-full min-w-0 flex-col">
      <div className="desktop-sidebar-header flex h-[var(--workspace-header-height)] shrink-0 items-center gap-2 px-3">
        <Link
          to="/"
          onClick={close}
          aria-label="Grill Me home"
          className="min-w-0 rounded-md outline-offset-4"
        >
          <BrandLockup
            className="gap-2"
            markClassName="size-6"
            wordmarkClassName="text-ui tracking-[-0.02em]"
          />
        </Link>
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className="ml-auto hidden md:inline-flex"
                aria-label="Collapse sidebar"
                aria-expanded
                aria-controls="desktop-sidebar"
                aria-keyshortcuts="Control+b"
                onClick={onCollapse}
              >
                <PanelLeftClose size={15} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Collapse sidebar · Ctrl B
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3 pt-2">
        <Button
          asChild
          className="sidebar-create mb-3 w-full justify-start gap-2"
        >
          <Link to="/" onClick={close}>
            <Plus size={16} />
            New challenge
          </Link>
        </Button>
        <nav
          aria-label="Main navigation"
          className="flex flex-1 flex-col gap-6"
        >
          <ul className="grid gap-0.5">{mainLinks.map(renderLink)}</ul>
          <ul className="mt-auto grid gap-0.5">
            {utilityLinks.map(renderLink)}
          </ul>
        </nav>
      </div>
      <div className="shrink-0 border-t border-line/60 px-2 pb-2 pt-1.5">
        <AccountMenu profile={profile} close={close} />
      </div>
    </div>
  );
}
