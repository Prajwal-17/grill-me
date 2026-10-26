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
    <main className="flex min-h-dvh flex-col gap-12 px-5 pb-16">
      <header className="-mx-5 flex min-h-16 items-center justify-between gap-4 border-b border-line px-5 py-2">
        <BrandLockup />
        <div className="w-40">
          <ThemeSelect />
        </div>
      </header>
      <section className="mx-auto my-auto w-full max-w-[400px] rounded-xl border border-line bg-surface p-7 sm:p-8">
        <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.025em]">
          Your practice workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Build, review, and revisit what you learn. Choose your local profile
          to get started.
        </p>
        <form onSubmit={submit} className="mt-7 grid gap-4">
          <label className="grid gap-2 text-sm font-medium" htmlFor="email">
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
          <p className="text-xs text-muted">
            Your email loads your local profile.
          </p>
          {start.error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm leading-6 text-destructive"
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
