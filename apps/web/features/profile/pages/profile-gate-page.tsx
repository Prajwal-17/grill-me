"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  Brain,
  Check,
  Code2,
  LoaderCircle,
  SlidersHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../../shared/components/ui/button";
import type { Profile } from "../../../shared/types/api";
import { savePreferences, startProfile } from "../api/profile-api";
import {
  DEFAULT_PREFERENCES,
  PreferencesFields,
  type PreferenceValues,
} from "../components/preferences-fields";
import { getStoredProfile, storeProfile } from "../lib/profile-storage";

export function ProfileGatePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [onboardingProfile, setOnboardingProfile] = useState<Profile | null>(
    null,
  );
  const [preferences, setPreferences] =
    useState<PreferenceValues>(DEFAULT_PREFERENCES);

  useEffect(() => {
    if (getStoredProfile()) router.replace("/exercises");
  }, [router]);

  const start = useMutation({
    mutationFn: () => startProfile(email),
    onSuccess: (profile) => {
      storeProfile(profile);
      setOnboardingProfile(profile);
    },
  });

  const save = useMutation({
    mutationFn: () => savePreferences(onboardingProfile!.id, preferences),
    onSuccess: () => router.push("/exercises"),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim()) start.mutate();
  }

  function updatePreference<K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) {
    save.reset();
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="page-enter relative grid min-h-dvh place-items-center overflow-hidden px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand/10 blur-[120px]" />
      <section className="surface-panel relative grid w-full max-w-6xl overflow-hidden rounded-3xl lg:grid-cols-[0.78fr_1.22fr]">
        <aside className="relative overflow-hidden border-b border-line bg-brand-soft/45 p-7 sm:p-10 lg:border-b-0 lg:border-r">
          <div className="absolute -left-24 top-24 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
          <div className="relative flex h-full min-h-64 flex-col">
            <div className="flex items-center gap-3 text-sm font-semibold">
              <span className="grid size-9 place-items-center rounded-xl border border-brand/25 bg-brand/10 text-brand-bright shadow-lg shadow-brand/10">
                <Code2 size={18} />
              </span>
              Grill Me
            </div>
            <div className="my-auto py-10">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-bright">
                Personalized practice
              </p>
              <h1 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">
                Practice that remembers how you learn.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-muted">
                Set your pace, stack, and learning context once. Every future
                exercise can start closer to what you actually need.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-muted">
              <p className="flex items-center gap-2.5">
                <Check className="text-brand-bright" size={16} /> Tailored
                difficulty and duration
              </p>
              <p className="flex items-center gap-2.5">
                <Brain className="text-brand-bright" size={16} /> Memory you can
                inspect and edit
              </p>
              <p className="flex items-center gap-2.5">
                <SlidersHorizontal className="text-brand-bright" size={16} />
                Preferences stay under your control
              </p>
            </div>
          </div>
        </aside>

        <div className="p-6 sm:p-10 lg:p-12">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-bright">
                {onboardingProfile ? "Make it yours" : "Welcome"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                {onboardingProfile
                  ? "Choose your practice preferences"
                  : "Create your local profile"}
              </h2>
            </div>
            <span className="rounded-full border border-line-strong bg-canvas/50 px-3 py-1 text-xs text-muted">
              {onboardingProfile ? "2 of 2" : "1 of 2"}
            </span>
          </div>

          {!onboardingProfile ? (
            <form className="grid gap-4" onSubmit={submit}>
              <label className="grid gap-2 text-sm font-medium" htmlFor="email">
                Email
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 rounded-xl border border-line-strong bg-canvas/70 px-4 text-sm outline-none transition-all duration-200 placeholder:text-dim hover:border-brand/40 focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10"
                />
              </label>
              {start.error && (
                <p className="text-sm text-red-400" role="alert">
                  {start.error.message}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between gap-4">
                <p className="text-xs leading-5 text-dim">
                  Used only to load your local profile and history.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={start.isPending}
                >
                  {start.isPending ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  Continue
                </Button>
              </div>
            </form>
          ) : (
            <form
              className="grid gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <PreferencesFields
                values={preferences}
                onChange={updatePreference}
                compact
              />
              {save.error && (
                <p className="text-sm text-red-400" role="alert">
                  {save.error.message} Your entries are still here.
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push("/exercises")}
                >
                  Skip for now
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={save.isPending}
                >
                  {save.isPending && (
                    <LoaderCircle className="animate-spin" size={16} />
                  )}
                  Save and start practicing
                  {!save.isPending && <ArrowRight size={16} />}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
