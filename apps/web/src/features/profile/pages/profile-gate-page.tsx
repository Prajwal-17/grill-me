import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BrandLockup } from "@/shared/components/brand";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { ThemeSelect } from "@/shared/components/theme-provider";
import { useAppStore } from "@/shared/stores/app-store";
import { startProfile } from "@/features/profile/api/profile-api";
import { DesktopVersionLink } from "@/shared/components/layout/desktop-version";
import { ProviderHealthNotice } from "@/features/settings/provider-health";
import { useDesktopUpdates } from "@/features/settings/desktop-updates";

export function ProfileGatePage() {
  const [email, setEmail] = useState("");
  const [updateToken, setUpdateToken] = useState("");
  const updates = useDesktopUpdates();
  const setProfile = useAppStore((state) => state.setProfile);
  const start = useMutation({
    mutationFn: async () => {
      if (window.desktopBridge) {
        const state = await window.desktopBridge.getUpdateState();
        if (state.enabled && !state.authorized) {
          const connected = await window.desktopBridge.configureUpdates({
            email,
            token: updateToken || undefined,
          });
          if (!connected.authorized) throw new Error(connected.message);
          setUpdateToken("");
        }
      }
      return startProfile(email);
    },
    onSuccess: setProfile,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) start.mutate();
  }
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-chrome px-5 pb-8">
      <div className="-mx-5">
        <header className="desktop-app-header flex min-h-[var(--workspace-header-height)] items-center justify-between gap-4 border-b border-line px-5 py-2 md:py-0">
          <BrandLockup markClassName="size-7" wordmarkClassName="text-ui" />
          <div className="flex shrink-0 items-center gap-1">
            <DesktopVersionLink />
            <Link
              to="/settings"
              className="inline-flex h-9 items-center rounded-md px-3 text-ui text-muted transition-colors hover:bg-elevated hover:text-foreground"
            >
              Settings
            </Link>
            <ThemeSelect />
          </div>
        </header>
        <ProviderHealthNotice />
      </div>
      <section className="mx-auto my-auto w-full max-w-[420px] rounded-xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-section font-semibold tracking-[-0.02em]">
          Choose a profile
        </h1>
        <p className="mt-2 text-ui leading-6 text-muted">
          Open your local practice workspace.
        </p>
        <form onSubmit={submit} className="mt-5 grid gap-4">
          <label className="grid gap-2 text-ui font-medium" htmlFor="email">
            Profile email
            <Input
              id="email"
              name="email"
              className="h-11"
              type="email"
              autoComplete="email"
              required
              autoFocus
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              disabled={start.isPending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {updates.data?.enabled && !updates.data.authorized && (
            <label
              className="grid gap-2 text-ui font-medium"
              htmlFor="update-token"
            >
              GitHub update token
              <Input
                id="update-token"
                type="password"
                autoComplete="new-password"
                maxLength={8192}
                value={updateToken}
                onChange={(event) => setUpdateToken(event.target.value)}
                disabled={start.isPending}
                placeholder="Read-only repository token"
              />
              <span className="text-supporting font-normal text-muted">
                Saved using your system credential store when available;
                otherwise kept for this session. The owner can leave it blank
                when signed in through GitHub CLI.
              </span>
            </label>
          )}
          {updates.data?.authSource === "owner-cli" && (
            <p className="text-supporting text-muted">
              Private updates connected through the owner's GitHub CLI login.
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={
              start.isPending ||
              (Boolean(window.desktopBridge) && updates.isPending)
            }
          >
            {start.isPending && (
              <LoaderCircle size={16} className="animate-spin" />
            )}
            Continue
          </Button>
          {start.error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-ui leading-6 text-destructive"
            >
              <AlertCircle size={16} className="shrink-0" />
              {start.error.message}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
