import { Link, useLocation } from "react-router";
import {
  BookOpen,
  ListChecks,
  History,
  ScrollText,
  House,
  Plus,
  Settings2,
} from "lucide-react";
import { buttonStyles } from "@/shared/components/ui/button";
import { ThemeSelect } from "@/shared/components/theme-provider";
import { BrandLockup } from "@/shared/components/brand";
import { cn } from "@/shared/lib/cn";
import type { Profile } from "@/shared/types/api";
import { AccountMenu } from "@/shared/components/layout/account-menu";

export function Navigation({
  profile,
  close,
}: {
  profile: Profile;
  close?: () => void;
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
      href: "/history",
      label: "History",
      icon: History,
      active: pathname === "/history",
    },
  ];
  const utilityLinks = [
    {
      href: "/logs",
      label: "Logs",
      icon: ScrollText,
      active: pathname === "/logs" || pathname.startsWith("/logs/"),
    },
    {
      href: "/preferences",
      label: "Preferences",
      icon: Settings2,
      active: pathname === "/preferences",
    },
  ];
  const renderLink = ({
    href,
    label,
    icon: Icon,
    active,
  }: (typeof mainLinks)[number]) => (
    <Link
      key={href}
      to={href}
      aria-current={active ? "page" : undefined}
      onClick={close}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-ui transition-colors duration-100 md:min-h-9",
        active
          ? "bg-nav-active font-medium text-nav-active-foreground"
          : "text-muted hover:bg-elevated hover:text-foreground",
      )}
    >
      <Icon
        size={16}
        strokeWidth={1.7}
        className={
          active ? "shrink-0 text-nav-active-foreground" : "shrink-0 text-muted"
        }
        aria-hidden="true"
      />
      {label}
    </Link>
  );
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-[var(--workspace-header-height)] shrink-0 items-center border-b border-line/60 px-4">
        <Link
          to="/"
          onClick={close}
          aria-label="Grill Me home"
          className="rounded-md outline-offset-4"
        >
          <BrandLockup
            className="gap-2"
            markClassName="size-7"
            wordmarkClassName="text-ui tracking-[-0.02em]"
          />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-clip px-3 py-4">
        <Link
          to="/"
          onClick={close}
          className={cn(
            buttonStyles("secondary"),
            "mb-4 w-full justify-start bg-surface md:h-9",
          )}
        >
          <Plus size={16} />
          New build
        </Link>
        <nav aria-label="Main navigation" className="grid gap-0.5">
          {mainLinks.map(renderLink)}
        </nav>
      </div>
      <div className="shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <nav aria-label="Workspace settings" className="mb-3 grid gap-0.5">
          {utilityLinks.map(renderLink)}
        </nav>
        <div className="grid min-w-0 gap-1 border-t border-line pt-3">
          <ThemeSelect />
          <AccountMenu profile={profile} close={close} />
        </div>
      </div>
    </div>
  );
}
