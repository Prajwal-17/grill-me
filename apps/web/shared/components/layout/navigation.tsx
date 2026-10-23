"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ListChecks,
  History,
  ScrollText,
  House,
  Plus,
  Settings2,
  Circle,
  Pause,
} from "lucide-react";
import { buttonStyles } from "@/shared/components/ui/button";
import { ThemeSelect } from "@/shared/components/theme-provider";
import { BrandLockup } from "@/shared/components/brand";
import { cn } from "@/shared/lib/cn";
import type { Profile } from "@/shared/types/api";
import { AccountMenu } from "@/shared/components/layout/account-menu";
import {
  challengeKeys,
  getActiveChallenges,
} from "@/features/challenges/api/challenge-api";

export function Navigation({
  profile,
  close,
}: {
  profile: Profile;
  close?: () => void;
}) {
  const pathname = usePathname();
  const selectedId = useSearchParams().get("id");
  const active = useQuery({
    queryKey: challengeKeys.active(profile.id),
    queryFn: () => getActiveChallenges(profile.id),
  });
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
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={close}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-100 md:min-h-9",
        active
          ? "bg-brand-soft font-medium text-brand"
          : "text-muted hover:bg-elevated/60 hover:text-foreground",
      )}
    >
      <Icon
        size={16}
        strokeWidth={1.7}
        className={active ? "shrink-0 text-brand" : "shrink-0 text-muted"}
        aria-hidden="true"
      />
      {label}
    </Link>
  );
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center px-4">
        <Link
          href="/"
          onClick={close}
          aria-label="Grill Me home"
          className="rounded-md outline-offset-4"
        >
          <BrandLockup
            className="gap-2"
            markClassName="size-8"
            wordmarkClassName="text-base"
          />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        <Link
          href="/"
          onClick={close}
          className={cn(
            buttonStyles("secondary"),
            "mb-4 w-full justify-start bg-surface",
          )}
        >
          <Plus size={16} />
          New build
        </Link>
        <nav aria-label="Main navigation" className="grid gap-0.5">
          {mainLinks.map(renderLink)}
        </nav>
        {!!active.data?.length && (
          <section className="mt-7" aria-label="Continue practicing">
            <h2 className="mb-2 px-2.5 text-xs font-medium text-muted">
              Continue practicing
            </h2>
            <div className="grid gap-1">
              {active.data.slice(0, 4).map((challenge) => {
                const selected =
                  pathname === "/chat" && selectedId === challenge.id;
                const Icon = challenge.status === "paused" ? Pause : Circle;
                return (
                  <Link
                    key={challenge.id}
                    href={`/chat?id=${challenge.id}`}
                    onClick={close}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md px-2.5 py-2.5 text-xs leading-5 transition-colors",
                      selected
                        ? "bg-brand-soft text-brand"
                        : "text-muted hover:bg-elevated/60 hover:text-foreground",
                    )}
                  >
                    <Icon
                      size={13}
                      className="mt-1 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="line-clamp-2">{challenge.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        #{challenge.number} ·{" "}
                        {challenge.status === "paused"
                          ? "Paused"
                          : "In progress"}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
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
