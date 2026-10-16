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
      <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
        <Link
          href="/"
          onClick={close}
          aria-label="Grill Me home"
          className="rounded-lg outline-offset-4"
        >
          <BrandLockup />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5">
        <Link
          href="/"
          onClick={close}
          className={cn(buttonStyles("primary"), "mb-6 w-full justify-start")}
        >
          <Plus size={16} />
          New build
        </Link>
        <nav aria-label="Main navigation" className="grid gap-1">
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
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm outline-offset-2 transition-colors duration-100 focus-visible:transition-none",
                active
                  ? "bg-elevated font-medium text-foreground"
                  : "text-muted hover:bg-elevated/60 hover:text-foreground",
              )}
            >
              <Icon size={17} strokeWidth={1.6} className="shrink-0" />
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
