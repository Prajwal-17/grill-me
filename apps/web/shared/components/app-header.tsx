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
  X,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buttonStyles } from "./ui/button";
import { ThemeSelect } from "./theme-provider";
import { clearProfile } from "../../features/profile/lib/profile-storage";
import type { Profile } from "../types/api";
function Navigation({
  profile,
  close,
}: {
  profile: Profile;
  close?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queries = useQueryClient();
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-9 flex items-center justify-between px-2 pt-2">
        <Link
          href="/exercises"
          onClick={close}
          className="text-lg font-semibold tracking-tight"
        >
          Grill Me<span className="ml-1 text-muted">.</span>
        </Link>
        {close && (
          <button aria-label="Close navigation" className="p-2" onClick={close}>
            <X size={18} />
          </button>
        )}
      </div>
      <Link
        href="/chat?new=1"
        onClick={close}
        className={buttonStyles("primary")}
      >
        <Plus size={16} />
        New exercise
      </Link>
      <nav className="mt-5 grid gap-1" aria-label="Main navigation">
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
          <Link
            className="nav-link"
            aria-current={active ? "page" : undefined}
            key={href}
            href={href}
            onClick={close}
          >
            <Icon size={16} strokeWidth={1.6} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto grid gap-5 border-t border-line px-1 pt-5">
        <ThemeSelect />
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-xs text-muted" title={profile.email}>
            {profile.email}
          </span>
          <button
            className="shrink-0 rounded p-2 text-muted hover:bg-elevated hover:text-foreground"
            aria-label="Change profile"
            title="Change profile"
            onClick={() => {
              clearProfile();
              queries.clear();
              close?.();
              router.replace("/");
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
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
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  useEffect(() => {
    const media = matchMedia("(min-width: 768px)");
    const onResize = () => {
      if (media.matches) dialog.current?.close();
    };
    media.addEventListener("change", onResize);
    return () => {
      media.removeEventListener("change", onResize);
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="min-h-dvh md:pl-[212px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[212px] border-r border-line bg-canvas md:block">
        <Navigation profile={profile} />
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 md:hidden">
        <Link href="/exercises" className="font-semibold">
          Grill Me.
        </Link>
        <button
          className="p-2"
          aria-label="Open navigation"
          onClick={() => {
            dialog.current?.showModal();
            document.body.style.overflow = "hidden";
          }}
        >
          <Menu size={20} />
        </button>
      </header>
      <dialog
        ref={dialog}
        aria-label="Navigation"
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(300px,85vw)] max-w-none border-0 bg-canvas p-0"
        onClose={() => {
          document.body.style.overflow = "";
        }}
        onClick={(event) => {
          if (
            event.target === event.currentTarget &&
            event.clientX > event.currentTarget.getBoundingClientRect().right
          )
            close();
        }}
      >
        <Navigation profile={profile} close={close} />
      </dialog>
      {children}
    </div>
  );
}
