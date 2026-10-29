import { Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
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
import { ThemeSelect } from "@/shared/components/theme-provider";
import { BrandLockup } from "@/shared/components/brand";
import { cn } from "@/shared/lib/cn";
import type { Profile } from "@/shared/types/api";
import { AccountMenu } from "./account-menu";
import {
  challengeKeys,
  getActiveChallenges,
} from "@/features/challenges/api/challenge-api";

export function Navigation({
  profile,
  close,
  onCollapse,
}: {
  profile: Profile;
  close?: () => void;
  onCollapse?: () => void;
}) {
  const { pathname, search } = useLocation();
  const currentChallenge = new URLSearchParams(search).get("id");
  const active = useQuery({
    queryKey: challengeKeys.active(profile.id),
    queryFn: () => getActiveChallenges(profile.id),
    staleTime: 30000,
  });
  const recent = [...(active.data ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);
  const mainLinks = [
    { href: "/", label: "Home", icon: House, active: pathname === "/" },
    {
      href: "/challenges",
      label: "Challenges",
      icon: BookOpen,
      active: pathname === "/challenges",
    },
    {
      href: "/quizzes",
      label: "Quizzes",
      icon: ListChecks,
      active: pathname === "/quizzes",
    },
    {
      href: "/history",
      label: "History",
      icon: History,
      active: pathname === "/history",
    },
  ];
  const utilityLinks = [
    { href: "/settings", label: "Settings", icon: Settings2 },
    { href: "/logs", label: "Logs", icon: ScrollText },
    { href: "/preferences", label: "Preferences", icon: SlidersHorizontal },
  ];
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
            <Plus size={15} />
            New build
          </Link>
        </Button>
        <nav aria-label="Main navigation" className="grid gap-0.5">
          {mainLinks.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
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
              <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        {recent.length > 0 && (
          <section className="mt-7" aria-labelledby="sidebar-recent-title">
            <h2
              id="sidebar-recent-title"
              className="mb-2 px-2.5 text-metadata font-medium text-muted"
            >
              Recent practice
            </h2>
            <nav aria-label="Recent practice" className="grid gap-1">
              {recent.map((challenge) => (
                <Link
                  key={challenge.id}
                  to={`/chat?id=${challenge.id}`}
                  onClick={close}
                  aria-current={
                    pathname === "/chat" && currentChallenge === challenge.id
                      ? "page"
                      : undefined
                  }
                  className={cn(
                    "sidebar-recent-item group min-w-0 rounded-md px-2.5 py-2 transition-colors duration-100",
                    pathname === "/chat" && currentChallenge === challenge.id
                      ? "bg-nav-active text-foreground"
                      : "text-muted hover:bg-elevated hover:text-foreground",
                  )}
                >
                  <span className="line-clamp-2 text-ui leading-5 text-foreground">
                    {challenge.title}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-metadata">
                    <span className="tabular-nums">#{challenge.number}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{challenge.scope}</span>
                  </span>
                </Link>
              ))}
            </nav>
          </section>
        )}
      </div>
      <div className="shrink-0 border-t border-line/60 px-2 pb-2 pt-1.5">
        <div
          className="mb-1 flex items-center gap-0.5"
          role="group"
          aria-label="Workspace tools"
        >
          {utilityLinks.map(({ href, label, icon: Icon }) => (
            <Tooltip key={href}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="icon-sm"
                  variant="ghost"
                  className={
                    pathname.startsWith(href)
                      ? "bg-elevated text-foreground"
                      : undefined
                  }
                >
                  <Link
                    to={href}
                    onClick={close}
                    aria-label={label}
                    aria-current={
                      pathname.startsWith(href) ? "page" : undefined
                    }
                  >
                    <Icon size={15} strokeWidth={1.7} />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          ))}
          <div className="ml-auto w-11 md:w-8">
            <ThemeSelect compact />
          </div>
        </div>
        <AccountMenu profile={profile} close={close} />
      </div>
    </div>
  );
}
