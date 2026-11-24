import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import type { Profile } from "@/shared/types/api";
import { CompactShell } from "@/shared/components/layout/compact-shell";

export function AppShell({
  profile,
  title,
  breadcrumbs = [],
  children,
  contentScrollable = true,
  centeredHeader = false,
}: {
  profile: Profile;
  title: string;
  breadcrumbs?: { label: string; href: string }[];
  children: ReactNode;
  contentScrollable?: boolean;
  centeredHeader?: boolean;
}) {
  return (
    <CompactShell profile={profile}>
      <div className="flex h-full min-h-0 flex-col">
        <nav
          aria-label="Breadcrumb"
          className="shrink-0 border-b border-line px-4 py-2.5 text-ui sm:px-6"
        >
          <div
            className={`flex min-w-0 items-center gap-2 ${centeredHeader ? "mx-auto w-full max-w-[1152px]" : ""}`}
          >
            {breadcrumbs.map(({ label, href }) => (
              <span key={href} className="flex shrink-0 items-center gap-2">
                <Link to={href} className="text-muted hover:text-foreground">
                  {label}
                </Link>
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className="text-muted"
                />
              </span>
            ))}
            <h1 className="min-w-0 truncate font-medium" title={title}>
              {title}
            </h1>
          </div>
        </nav>
        <div
          className={
            contentScrollable
              ? "min-h-0 flex-1 overflow-y-auto overscroll-contain"
              : "min-h-0 flex-1 overflow-clip"
          }
        >
          {children}
        </div>
      </div>
    </CompactShell>
  );
}
