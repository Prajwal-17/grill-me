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

export function ProfileGatePage() {
  const [email, setEmail] = useState("");
  const setProfile = useAppStore((state) => state.setProfile);
  const start = useMutation({
    mutationFn: () => startProfile(email),
    onSuccess: setProfile,
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) start.mutate();
  }
  return (
    <main className="flex min-h-dvh flex-col gap-12 bg-chrome px-5 pb-16">
      <header className="desktop-app-header -mx-5 flex min-h-[var(--workspace-header-height)] items-center justify-between gap-4 border-b border-line px-5 py-2 md:py-0">
        <BrandLockup markClassName="size-7" wordmarkClassName="text-ui" />
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="text-ui text-muted hover:text-foreground"
          >
            Settings
          </Link>
          <div className="w-40">
            <ThemeSelect />
          </div>
        </div>
      </header>
      <section className="mx-auto my-auto w-full max-w-[420px] rounded-xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-section font-semibold tracking-[-0.02em]">
          Choose a profile
        </h1>
        <p className="mt-2 text-ui leading-6 text-muted">
          Open your local practice workspace.
        </p>
        <form onSubmit={submit} className="mt-6 grid gap-5">
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
          <Button type="submit" variant="primary" disabled={start.isPending}>
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
