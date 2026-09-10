"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppHeader } from "../../../shared/components/app-header";
import { Button } from "../../../shared/components/ui/button";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import type { Difficulty, ProfilePreferences } from "../../../shared/types/api";
import { getPreferences, savePreferences } from "../api/profile-api";
import { useProfile } from "../hooks/use-profile";
import { clearProfile } from "../lib/profile-storage";

const preferencesKey = (profileId?: string) =>
  ["profile", "preferences", profileId] as const;

type FormState = Omit<ProfilePreferences, "profileId" | "updatedAt">;

const defaults: FormState = {
  experienceLevel: null,
  languagesStack: null,
  learningGoals: null,
  preferredDuration: 60,
  difficulty: "balanced",
  aboutMe: null,
};

function text(value: string | null) {
  return value ?? "";
}

function formValues(preferences: ProfilePreferences): FormState {
  const {
    profileId: _profileId,
    updatedAt: _updatedAt,
    ...values
  } = preferences;
  return values;
}

export function PreferencesPage() {
  const profile = useProfile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);

  const preferences = useQuery({
    queryKey: preferencesKey(profile?.id),
    queryFn: () => getPreferences(profile!.id),
    enabled: Boolean(profile),
  });

  const form =
    edits ?? (preferences.data ? formValues(preferences.data) : defaults);

  const save = useMutation({
    mutationFn: () => savePreferences(profile!.id, form),
    onSuccess: (value) => {
      queryClient.setQueryData(preferencesKey(profile!.id), value);
      setEdits(formValues(value));
      setSaved(true);
    },
    onMutate: () => setSaved(false),
  });

  if (profile === undefined || preferences.isLoading) return <LoadingScreen />;
  if (!profile) return null;
  if (preferences.error && !preferences.data) {
    return (
      <>
        <AppHeader profile={profile} />
        <ErrorState
          title="Could not load preferences."
          message={preferences.error.message}
          onRetry={() => preferences.refetch()}
        />
      </>
    );
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setEdits((current) => ({ ...(current ?? form), [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  const fieldClass =
    "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-dim hover:border-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15";

  return (
    <>
      <AppHeader profile={profile} />
      <main className="mx-auto w-full max-w-3xl px-5 py-9 sm:px-7 sm:py-14">
        <header className="border-b border-line pb-7">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-[28px]">
            Preferences
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Shape future exercises and explanations. Everything here is
            optional, editable, and never changes exercises you already created.
          </p>
        </header>

        <form className="divide-y divide-line" onSubmit={submit}>
          <section className="grid gap-5 py-7 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Experience level
              <input
                value={text(form.experienceLevel)}
                onChange={(event) =>
                  update("experienceLevel", event.target.value || null)
                }
                placeholder="e.g. Mid-level backend developer"
                maxLength={120}
                className={`${fieldClass} h-10 font-normal`}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Languages and stack
              <input
                value={text(form.languagesStack)}
                onChange={(event) =>
                  update("languagesStack", event.target.value || null)
                }
                placeholder="e.g. TypeScript, React, Postgres"
                maxLength={500}
                className={`${fieldClass} h-10 font-normal`}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium sm:col-span-2">
              Learning goals
              <textarea
                value={text(form.learningGoals)}
                onChange={(event) =>
                  update("learningGoals", event.target.value || null)
                }
                placeholder="What do you want to get better at?"
                rows={3}
                maxLength={1_000}
                className={`${fieldClass} resize-y py-2.5 font-normal leading-6`}
              />
            </label>
          </section>

          <section className="grid gap-5 py-7 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Preferred duration
              <select
                value={form.preferredDuration}
                onChange={(event) =>
                  update(
                    "preferredDuration",
                    Number(event.target.value) as 30 | 60 | 90,
                  )
                }
                className={`${fieldClass} h-10 font-normal`}
              >
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Difficulty
              <select
                value={form.difficulty}
                onChange={(event) =>
                  update("difficulty", event.target.value as Difficulty)
                }
                className={`${fieldClass} h-10 font-normal`}
              >
                <option value="easy">Easy</option>
                <option value="balanced">Balanced</option>
                <option value="challenging">Challenging</option>
              </select>
            </label>
          </section>

          <section className="py-7">
            <label className="grid gap-2 text-sm font-medium">
              About me
              <span className="font-normal leading-5 text-muted">
                Background, strengths, weak spots, or other learning context you
                want Grill Me to remember.
              </span>
              <textarea
                value={text(form.aboutMe)}
                onChange={(event) =>
                  update("aboutMe", event.target.value || null)
                }
                placeholder="e.g. I understand syntax quickly but need practice breaking vague problems into testable steps."
                rows={7}
                maxLength={4_000}
                className={`${fieldClass} resize-y py-2.5 font-normal leading-6`}
              />
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save preferences"}
              </Button>
              {saved && (
                <span
                  className="inline-flex items-center gap-1.5 text-sm text-green-400"
                  role="status"
                >
                  <Check size={15} /> Saved
                </span>
              )}
              {save.error && (
                <span className="text-sm text-red-400" role="alert">
                  {save.error.message} Your edits are still here.
                </span>
              )}
            </div>
          </section>
        </form>

        <section className="mt-4 flex items-center justify-between gap-5 rounded-lg border border-line bg-surface p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile.email}</p>
            <p className="mt-0.5 text-xs text-muted">Local profile</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              clearProfile();
              router.replace("/");
            }}
          >
            <LogOut size={15} /> Change profile
          </Button>
        </section>
      </main>
    </>
  );
}
