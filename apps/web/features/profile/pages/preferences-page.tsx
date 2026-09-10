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
import {
  getPreferences,
  preferencesKey,
  savePreferences,
} from "../api/profile-api";
import {
  DEFAULT_PREFERENCES,
  PreferencesFields,
  preferenceValues,
  type PreferenceValues,
} from "../components/preferences-fields";
import { useProfile } from "../hooks/use-profile";
import { clearProfile } from "../lib/profile-storage";

export function PreferencesPage() {
  const profile = useProfile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<PreferenceValues | null>(null);
  const [saved, setSaved] = useState(false);

  const preferences = useQuery({
    queryKey: preferencesKey(profile?.id),
    queryFn: () => getPreferences(profile!.id),
    enabled: Boolean(profile),
  });

  const form =
    edits ??
    (preferences.data
      ? preferenceValues(preferences.data)
      : DEFAULT_PREFERENCES);

  const save = useMutation({
    mutationFn: () => savePreferences(profile!.id, form),
    onSuccess: (value) => {
      queryClient.setQueryData(preferencesKey(profile!.id), value);
      setEdits(preferenceValues(value));
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

  function update<K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) {
    setSaved(false);
    setEdits((current) => ({ ...(current ?? form), [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <>
      <AppHeader profile={profile} />
      <main className="page-enter mx-auto w-full max-w-4xl px-5 py-9 sm:px-7 sm:py-14">
        <header className="mb-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-bright">
            Personalization
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-[28px]">
            Preferences
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Shape future exercises and explanations. Everything here is
            optional, editable, and never changes exercises you already created.
          </p>
        </header>

        <form
          className="surface-panel overflow-hidden rounded-2xl p-5 sm:p-7"
          onSubmit={submit}
        >
          <PreferencesFields values={form} onChange={update} />
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-line pt-5">
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
        </form>

        <section className="card-lift mt-5 flex items-center justify-between gap-5 rounded-2xl border border-line bg-surface/75 p-4 shadow-sm shadow-black/10">
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
