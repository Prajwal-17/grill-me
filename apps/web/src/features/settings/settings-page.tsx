import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import type { LocalSettings } from "@repo/backend/shared/contracts";
import { AppShell } from "@/shared/components/layout/app-shell";
import { SettingsLayout } from "@/shared/components/layout/settings-layout";
import { BrandLockup } from "@/shared/components/brand";
import { Button } from "@/shared/components/ui/button";
import { useAppStore } from "@/shared/stores/app-store";
import { apiRequest } from "@/shared/lib/api-client";
import { localTransport } from "@/shared/lib/local-client";
import { settingsSections } from "@/shared/components/layout/settings-navigation";
import { AppearanceSettings } from "./appearance-settings";
import { ProviderSettings } from "./provider-settings";
import { RuntimeSettingsPanel } from "./runtime-settings";
import { SettingsFeedback, SettingsLoading } from "./settings-layout";
import { settingsKey } from "./use-settings-mutation";
import { AboutSettings } from "./about-settings";
import { DesktopVersionLink } from "@/shared/components/layout/desktop-version";

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
        <BrandLockup
          className="hidden sm:inline-flex"
          markClassName="size-7"
          wordmarkClassName="text-ui"
        />
        <span className="hidden text-muted sm:inline" aria-hidden="true">
          /
        </span>
        <h1 className="min-w-0 truncate text-ui font-medium">Settings</h1>
        <div className="ml-auto shrink-0">
          <DesktopVersionLink />
        </div>
      </header>
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
}
function LocalSettingsPanel() {
  const [params] = useSearchParams();
  const active =
    settingsSections.find((s) => s.id === params.get("section"))?.id ??
    "providers";
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => apiRequest<LocalSettings>("/settings"),
    staleTime: 30000,
    retry: false,
  });
  return (
    <SettingsLayout activeSection={active} kind="settings">
      <div hidden={active !== "appearance"}>
        <AppearanceSettings />
      </div>
      <div hidden={active !== "about"}>
        {window.desktopBridge && <AboutSettings active={active === "about"} />}
      </div>
      {active !== "appearance" && active !== "about" && settings.isPending && (
        <SettingsLoading />
      )}
      {active !== "appearance" && active !== "about" && settings.isError && (
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
