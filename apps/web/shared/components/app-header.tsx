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
      "inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium transition-all duration-200 sm:px-3 sm:text-sm",
      active
        ? "bg-elevated text-foreground shadow-sm shadow-black/20"
        : "text-muted hover:bg-white/[0.035] hover:text-foreground",
    );

  return (
    <header className="sticky top-0 z-20 grid h-14 grid-cols-[auto_1fr_auto] items-center border-b border-line/80 bg-canvas/80 px-3 shadow-sm shadow-black/10 backdrop-blur-xl sm:px-5 lg:grid-cols-[1fr_auto_1fr]">
      <Link
        href="/exercises"
        className="group inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        aria-label="Grill Me"
      >
        <span
          className="grid size-7 grid-cols-2 gap-0.5 rounded-lg border border-brand/60 bg-brand p-1.5 shadow-lg shadow-brand/15 transition-all duration-200 group-hover:-rotate-3 group-hover:scale-105"
          aria-hidden="true"
        >
          <span className="rounded-[1px] bg-slate-950/90" />
          <span className="rounded-[1px] bg-slate-950/45" />
          <span className="rounded-[1px] bg-slate-950/45" />
          <span className="rounded-[1px] bg-slate-950/90" />
        </span>
        <span className="hidden sm:inline">Grill Me</span>
      </Link>
      <nav
        className="mx-auto flex items-center justify-center rounded-xl border border-line/70 bg-surface/65 p-0.5"
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
            "size-9 px-0 shadow-none sm:w-auto sm:px-3",
          )}
        >
          <Plus size={15} />{" "}
          <span className="hidden sm:inline">New exercise</span>
        </Link>
      </div>
    </header>
  );
}
