"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppShell } from "../../../shared/components/layout/app-shell";
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
export function PreferencesPage() {
  const profile = useProfile();
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
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  function update<K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) {
    setSaved(false);
    save.reset();
    setEdits((current) => ({ ...(current ?? form), [key]: value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }
  return (
    <AppShell profile={profile}>
      {preferences.isLoading ? (
        <LoadingScreen />
      ) : preferences.error && !preferences.data ? (
        <ErrorState
          title="Could not load preferences"
          message={preferences.error.message}
          onRetry={() => preferences.refetch()}
        />
      ) : (
        <main className="page max-w-[850px]">
          <form onSubmit={submit}>
            <header className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-4 border-b border-line bg-surface px-1 pb-6 pt-1 md:top-0">
              <h1 className="page-title">Preferences</h1>
              <Button type="submit" variant="primary" disabled={save.isPending}>
                {save.isPending ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : saved ? (
                  <Check size={15} />
                ) : null}
                {save.isPending
                  ? "Saving…"
                  : saved
                    ? "Saved"
                    : "Save preferences"}
              </Button>
            </header>
            <fieldset disabled={save.isPending}>
              <PreferencesFields
                values={form}
                onChange={update}
                disabled={save.isPending}
              />
            </fieldset>
            <div className="mt-5 min-h-6" aria-live="polite">
              {saved && (
                <p className="feedback">
                  <Check size={16} />
                  Preferences saved
                </p>
              )}
              {save.error && (
                <p role="alert" className="feedback">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {save.error.message}
                </p>
              )}
            </div>
          </form>
        </main>
      )}
    </AppShell>
  );
}
