import {
  Monitor,
  Bot,
  Terminal,
  UserRound,
  Target,
  Folder,
  Info,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { cn } from "@/shared/lib/cn";

export const settingsSections = [
  { id: "providers", icon: Bot, label: "Providers" },
  { id: "appearance", icon: Monitor, label: "Appearance" },
  { id: "runtime", icon: Terminal, label: "Advanced" },
  ...(window.desktopBridge
    ? [{ id: "about", icon: Info, label: "About" } as const]
    : []),
] as const;

export const preferenceSections = [
  { id: "profile", icon: UserRound, label: "Profile" },
  { id: "practice", icon: Target, label: "Practice" },
  { id: "projects", icon: Folder, label: "Projects" },
] as const;

export function SettingsSectionNavigation({
  kind,
  close,
}: {
  kind: "settings" | "preferences";
  close?: () => void;
}) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const sections = kind === "settings" ? settingsSections : preferenceSections;
  const active =
    sections.find(({ id }) => id === params.get("section"))?.id ??
    sections[0].id;

  return (
    <ul className="grid gap-1">
      {sections.map(({ id, label, icon: Icon }) => {
        const next = new URLSearchParams(params);
        next.set("section", id);
        return (
          <li key={id}>
            <Link
              to={{ pathname, search: `?${next}` }}
              onClick={close}
              aria-current={active === id ? "page" : undefined}
              className={cn(
                "sidebar-nav-item flex items-center gap-2.5 rounded-md px-3 transition-colors duration-100",
                active === id
                  ? "bg-nav-active font-medium text-nav-active-foreground"
                  : "text-muted hover:bg-elevated hover:text-foreground",
              )}
            >
              <Icon size={16} className="shrink-0" aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
