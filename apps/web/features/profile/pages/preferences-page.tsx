"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/shared/components/layout/app-shell";
import { Button } from "@/shared/components/ui/button";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import {
  getPreferences,
  preferencesKey,
  savePreferences,
} from "@/features/profile/api/profile-api";
import {
  DEFAULT_PREFERENCES,
  PreferencesFields,
  preferenceValues,
  type PreferenceValues,
} from "@/features/profile/components/preferences-fields";
import { apiRequest } from "@/shared/lib/api-client";
import { DEFAULT_CODEX_MODEL } from "@repo/preferences";
import { useProfile } from "@/features/profile/hooks/use-profile";
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
  const codexModels = useQuery({
    queryKey: ["codex-models", profile?.id],
    queryFn: () =>
      apiRequest<{ models: { id: string; label: string }[] }>(
        "/judges/models",
        {},
        profile!.id,
      ),
    enabled: Boolean(profile),
    retry: false,
    staleTime: 60_000,
  });
  const form =
    edits ??
    (preferences.data
      ? preferenceValues(preferences.data)
      : DEFAULT_PREFERENCES);
  const save = useMutation({
    mutationFn: () =>
      savePreferences(profile!.id, {
        ...form,
        knownConcepts: form.knownConcepts.map((v) => v.trim()).filter(Boolean),
        topicFamiliarity: form.topicFamiliarity.filter((v) => v.topic.trim()),
      }),
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
        <main className="mx-auto w-full max-w-[850px] px-5 pb-12 pt-7 md:px-10 md:pb-16 md:pt-11">
          <form onSubmit={submit}>
            <header className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-4 border-b border-line bg-surface px-1 pb-6 pt-1 md:top-0">
              <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.025em]">
                Preferences
              </h1>
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
              <section className="grid gap-6 border-b border-line py-7 md:grid-cols-[150px_minmax(0,1fr)]">
                <h2 className="text-[15px] font-semibold">Code reviews</h2>
                <div className="space-y-2">
                  <label
                    htmlFor="codex-model"
                    className="block text-sm font-medium"
                  >
                    Codex model
                  </label>
                  <input
                    id="codex-model"
                    list="codex-model-options"
                    value={form.codexModel}
                    required
                    maxLength={160}
                    onChange={(e) => update("codexModel", e.target.value)}
                    className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-foreground"
                  />
                  <datalist id="codex-model-options">
                    {(
                      codexModels.data?.models ?? [
                        { id: DEFAULT_CODEX_MODEL, label: "GPT-5.6 Sol" },
                      ]
                    ).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </datalist>
                  <p className="text-xs leading-5 text-muted">
                    Default: GPT-5.6 Sol for complex code reviews. Choose an
                    available model or enter its ID. Applies to new Codex review
                    runs.
                  </p>
                  <p className="text-xs leading-5 text-muted">
                    Review sessions are temporary. Prompts, responses, and tool
                    activity are saved in Grill Me’s Logs.
                  </p>
                  {codexModels.isLoading && (
                    <p className="text-xs text-muted">
                      Loading available models…
                    </p>
                  )}
                  {codexModels.error && (
                    <p className="text-xs text-muted">
                      Could not load models: {codexModels.error.message}{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => codexModels.refetch()}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                </div>
              </section>
              <PreferencesFields
                values={form}
                onChange={update}
                disabled={save.isPending}
              />
            </fieldset>
            <div className="mt-5 min-h-6" aria-live="polite">
              {saved && (
                <p className="flex items-start gap-2 text-sm leading-6 text-success">
                  <Check size={16} />
                  Preferences saved
                </p>
              )}
              {save.error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm leading-6 text-destructive"
                >
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
