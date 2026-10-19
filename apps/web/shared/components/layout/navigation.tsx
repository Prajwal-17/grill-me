"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-12 shrink-0 items-center px-3">
        <Link
          href="/"
          onClick={close}
          aria-label="Grill Me home"
          className="rounded-lg outline-offset-4"
        >
          <BrandLockup
            className="gap-2"
            markClassName="size-9"
            wordmarkClassName="text-base"
          />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <Link
          href="/"
          onClick={close}
          className={cn(
            buttonStyles("primary"),
            "mb-3 w-full justify-start transition-[opacity,transform] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none",
          )}
        >
          <Plus size={16} />
          New build
        </Link>
        <nav aria-label="Main navigation" className="grid gap-0.5">
          {[
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
          ].map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={close}
              className={cn(
                "group relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm outline-offset-2 transition-[background-color,color] duration-150 ease-out focus-visible:transition-none motion-reduce:transition-none md:h-10",
                active
                  ? "bg-elevated font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground/70"
                  : "text-muted hover:bg-elevated/60 hover:text-foreground",
              )}
            >
              <Icon
                size={17}
                strokeWidth={1.7}
                className="shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-px motion-reduce:transition-none"
              />
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="grid shrink-0 min-w-0 gap-1 border-t border-line px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <ThemeSelect />
        <AccountMenu profile={profile} close={close} />
      </div>
    </div>
  );
}
