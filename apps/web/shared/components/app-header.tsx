"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { buttonStyles } from "./ui/button";
import { cn } from "../lib/cn";
import type { Profile } from "../types/api";

export function AppHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const navClass = (active: boolean) =>
    cn(
      "inline-flex h-full items-center border-b text-sm transition-colors",
      active
        ? "border-brand text-foreground"
        : "border-transparent text-muted hover:text-foreground",
    );

  return (
    <header className="sticky top-0 z-20 grid h-14 grid-cols-[auto_1fr_auto] items-center border-b border-line bg-canvas/95 px-3 backdrop-blur sm:px-5 lg:grid-cols-[1fr_auto_1fr]">
      <Link
        href="/exercises"
        className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        aria-label="Grill Me"
      >
        <span
          className="grid size-6 grid-cols-2 gap-0.5 rounded-md bg-brand p-1"
          aria-hidden="true"
        >
          <span className="rounded-[1px] bg-white/95" />
          <span className="rounded-[1px] bg-white/55" />
          <span className="rounded-[1px] bg-white/55" />
          <span className="rounded-[1px] bg-white/95" />
        </span>
        <span className="hidden sm:inline">Grill Me</span>
      </Link>
      <nav
        className="flex h-full justify-center gap-3 sm:gap-6"
        aria-label="Main navigation"
      >
        <Link
          href="/exercises"
          className={navClass(
            pathname === "/exercises" || pathname === "/chat",
          )}
        >
          Exercises
        </Link>
        <Link href="/history" className={navClass(pathname === "/history")}>
          History
        </Link>
        <Link
          href="/preferences"
          className={navClass(pathname === "/preferences")}
        >
          Preferences
        </Link>
      </nav>
      <div className="flex min-w-0 items-center justify-end gap-3">
        <span className="hidden max-w-44 truncate font-mono text-xs text-dim xl:block">
          {profile.email}
        </span>
        <Link
          href="/chat?new=1"
          className={cn(
            buttonStyles("primary"),
            "size-9 px-0 sm:w-auto sm:px-3",
          )}
        >
          <Plus size={15} />{" "}
          <span className="hidden sm:inline">New exercise</span>
        </Link>
      </div>
    </header>
  );
}
