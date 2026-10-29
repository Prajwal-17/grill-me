import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Monitor, Terminal } from "lucide-react";
import type { LocalSettings } from "@repo/contracts";
import { AppShell } from "@/shared/components/layout/app-shell";
import { SettingsLayout } from "@/shared/components/layout/settings-layout";
import { BrandLockup } from "@/shared/components/brand";
import { Button } from "@/shared/components/ui/button";
import { useAppStore } from "@/shared/stores/app-store";
import { apiRequest } from "@/shared/lib/api-client";
import { localTransport } from "@/shared/lib/local-client";
import { cn } from "@/shared/lib/cn";
import { AppearanceSettings } from "./appearance-settings";
import { ProviderSettings } from "./provider-settings";
import { RuntimeSettingsPanel } from "./runtime-settings";
import { SettingsFeedback, SettingsLoading } from "./settings-layout";
import { settingsKey } from "./use-settings-mutation";

const sections = [
  { id: "appearance", label: "Appearance", icon: Monitor },
  { id: "providers", label: "AI providers", icon: Bot },
  { id: "runtime", label: "Local runtime", icon: Terminal },
] as const;
export function SettingsPage() {
  const profile = useAppStore((s) => s.profile);
  const content = localTransport ? (
    <LocalSettingsPanel />
  ) : (
    <p className="p-6 text-ui text-muted">
      Application settings are available in the desktop app and local
      development server.
    </p>
  );
  if (profile)
    return (
      <AppShell profile={profile} title="Settings" contentScrollable={false}>
        {content}
      </AppShell>
    );
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <header className="desktop-app-header flex min-h-[var(--workspace-header-height)] shrink-0 items-center gap-4 border-b border-line px-5">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/" aria-label="Back to profile">
            <ArrowLeft size={17} />
          </Link>
        </Button>
        <BrandLockup markClassName="size-7" wordmarkClassName="text-ui" />
        <span className="text-muted" aria-hidden="true">
          /
        </span>
        <h1 className="text-ui font-medium">Settings</h1>
      </header>
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
}
function LocalSettingsPanel() {
  const [params] = useSearchParams();
  const active =
    sections.find((s) => s.id === params.get("section"))?.id ?? "appearance";
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => apiRequest<LocalSettings>("/settings"),
    staleTime: 30000,
    retry: false,
  });
  return (
    <SettingsLayout
      activeSection={active}
      navigation={
        <nav aria-label="Settings sections" className="flex gap-1 md:flex-col">
          {sections.map(({ id, label, icon: Icon }) => {
            const next = new URLSearchParams(params);
            next.set("section", id);
            return (
              <Link
                key={id}
                to={{ search: `?${next}` }}
                aria-current={active === id ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-ui outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-9",
                  active === id
                    ? "bg-nav-active font-medium text-nav-active-foreground"
                    : "text-muted hover:bg-elevated hover:text-foreground",
                )}
              >
                <Icon size={16} className="shrink-0" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      }
    >
      <div hidden={active !== "appearance"}>
        <AppearanceSettings />
      </div>
      {active !== "appearance" && settings.isPending && <SettingsLoading />}
      {active !== "appearance" && settings.isError && (
        <SettingsFeedback
          error={settings.error}
          onRetry={() => void settings.refetch()}
        />
      )}
      {settings.data && (
        <>
          <div hidden={active !== "providers"}>
            <ProviderSettings data={settings.data} />
          </div>
          <div hidden={active !== "runtime"}>
            <RuntimeSettingsPanel data={settings.data} />
          </div>
        </>
      )}
    </SettingsLayout>
  );
}
