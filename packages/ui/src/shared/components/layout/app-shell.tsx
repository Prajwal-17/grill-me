import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight, PanelLeftOpen } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Kbd, KbdGroup } from "@/shared/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/cn";
import type { Profile } from "@/shared/types/api";
import { Navigation } from "@/shared/components/layout/navigation";
import { MobileNavigation } from "@/shared/components/layout/mobile-navigation";
import { useAppNavigation } from "@/shared/components/layout/use-app-navigation";
import { GenerationActivity } from "@/features/generations/components/generation-activity";

export function AppShell({
  profile,
  title,
  breadcrumbs = [],
  actions,
  children,
  contentScrollable = true,
}: {
  profile: Profile;
  title: string;
  breadcrumbs?: { label: string; href: string }[];
  actions?: ReactNode;
  children: ReactNode;
  contentScrollable?: boolean;
}) {
  const { collapsed, toggle, open, setOpen } = useAppNavigation();
  const sidebarLabel = collapsed ? "Open sidebar" : "Collapse sidebar";
  return (
    <div className="workspace-frame flex h-dvh overflow-hidden bg-chrome">
      <a
        href="#app-content"
        className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-lg bg-foreground px-4 py-2 text-ui text-canvas focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside
        id="desktop-sidebar"
        className={cn(
          "hidden h-full w-[var(--workspace-sidebar-width)] shrink-0 overflow-hidden md:block",
          collapsed && "md:w-0",
        )}
        aria-label="Sidebar"
        aria-hidden={collapsed || undefined}
        inert={collapsed}
      >
        <div className="h-full w-[var(--workspace-sidebar-width)]">
          <Navigation profile={profile} onCollapse={toggle} />
        </div>
      </aside>
      <div
        className={cn(
          "workspace-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas md:border-l md:border-line/60",
        )}
      >
        <header
          data-slot="page-header"
          className="workspace-toolbar z-30 flex min-h-[var(--workspace-header-height)] shrink-0 items-center gap-3 px-3"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className={cn("hidden shrink-0", collapsed && "md:block")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggle}
                    aria-label={sidebarLabel}
                    aria-expanded={!collapsed}
                    aria-controls="desktop-sidebar"
                    aria-keyshortcuts="Control+b"
                  >
                    <PanelLeftOpen size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="flex items-center gap-2"
                >
                  <span>{sidebarLabel}</span>
                  <KbdGroup aria-label="Control plus B">
                    <Kbd>Ctrl</Kbd>
                    <span aria-hidden="true">+</span>
                    <Kbd>B</Kbd>
                  </KbdGroup>
                </TooltipContent>
              </Tooltip>
            </div>
            <MobileNavigation profile={profile} open={open} setOpen={setOpen} />
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-2 text-ui">
                {breadcrumbs.map(({ label, href }) => (
                  <li
                    key={href}
                    className="flex min-w-0 shrink items-center gap-2"
                  >
                    <Link
                      to={href}
                      className="truncate rounded-sm text-muted transition-colors duration-100 hover:text-foreground"
                    >
                      {label}
                    </Link>
                    <ChevronRight
                      size={14}
                      className="text-muted"
                      aria-hidden="true"
                    />
                  </li>
                ))}
                <li className="min-w-0 flex-1" aria-current="page">
                  <h1
                    className="truncate font-medium tracking-[-0.01em]"
                    title={title}
                  >
                    {title}
                  </h1>
                </li>
              </ol>
            </nav>
          </div>
          <div
            data-slot="header-actions"
            className="workspace-toolbar-actions flex shrink-0 items-center gap-1.5"
          >
            <GenerationActivity />
            {actions && (
              <div className="workspace-context-actions flex items-center gap-1.5">
                {actions}
              </div>
            )}
          </div>
        </header>
        <div
          id="app-content"
          tabIndex={-1}
          data-slot="app-content"
          className={cn(
            "relative min-h-0 flex-1 outline-none",
            contentScrollable
              ? "overflow-y-auto overscroll-contain"
              : "overflow-hidden",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
