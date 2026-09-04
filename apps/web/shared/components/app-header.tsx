"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearProfile } from "../../features/profile/lib/profile-storage";
import { cn } from "../lib/cn";
import type { Profile } from "../types/api";

export function AppHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const navClass = (active: boolean) =>
    cn(
      "inline-flex h-full items-center border-b text-xs transition-colors",
      active
        ? "border-brand text-foreground"
        : "border-transparent text-muted hover:text-foreground",
    );

  return (
    <header className="sticky top-0 z-20 grid h-14 grid-cols-[auto_1fr_auto] items-center border-b border-line bg-canvas/95 px-4 backdrop-blur md:px-6 lg:grid-cols-[1fr_auto_1fr]">
      <Link
        href="/exercises"
        className="text-sm font-semibold tracking-tight"
        aria-label="Grill Me"
      >
        Grill Me
      </Link>
      <nav
        className="flex h-full justify-center gap-4 md:gap-6"
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
      </nav>
      <div className="flex min-w-0 items-center justify-end gap-3">
        <span className="hidden max-w-56 truncate font-mono text-[11px] text-dim md:block">
          {profile.email}
        </span>
        <button
          type="button"
          className="text-xs text-muted hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
          onClick={() => {
            clearProfile();
            router.replace("/");
          }}
        >
          Change
        </button>
      </div>
    </header>
  );
}
