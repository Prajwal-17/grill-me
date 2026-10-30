import { useSearchParams } from "react-router";
import { localTransport } from "@/shared/lib/local-client";
import { PreferencesSkeleton } from "@/shared/components/ui/loading-layouts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Input } from "@/shared/components/ui/input";
import { AppShell } from "@/shared/components/layout/app-shell";
import { SettingsLayout } from "@/shared/components/layout/settings-layout";
import { preferenceSections } from "@/shared/components/layout/settings-navigation";
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
  PreferenceRow,
  type PreferenceSection,
  preferenceValues,
  type PreferenceValues,
} from "@/features/profile/components/preferences-fields";
import { apiRequest } from "@/shared/lib/api-client";
import { DEFAULT_CODEX_MODEL } from "@repo/preferences";
import { ResumeImport } from "../components/resume-import";
import { useProfile } from "@/features/profile/hooks/use-profile";
export function PreferencesPage() {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<PreferenceValues | null>(null);
  const [saved, setSaved] = useState(false);
  const [params, setParams] = useSearchParams();
  const section =
    preferenceSections.find(({ id }) => id === params.get("section"))?.id ??
    "profile";
  function setSection(value: PreferenceSection) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("section", value);
      return next;
    });
  }
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
    enabled: Boolean(profile) && !localTransport,
    retry: false,
    staleTime: 60_000,
  });
  const form =
    edits ??
    (preferences.data
      ? preferenceValues(preferences.data)
      : DEFAULT_PREFERENCES);
  const dirty =
    edits !== null &&
    JSON.stringify(edits) !==
      JSON.stringify(
        preferences.data
          ? preferenceValues(preferences.data)
          : DEFAULT_PREFERENCES,
      );
  const save = useMutation({
    mutationFn: () =>
      savePreferences(profile!.id, {
        ...form,
        projects: form.projects.map((project) => ({
          ...project,
          technologies: project.technologies
            .map((value) => value.trim())
            .filter(Boolean),
        })),
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
    const invalid =
      event.currentTarget instanceof HTMLFormElement
        ? event.currentTarget.querySelector<
            HTMLInputElement | HTMLTextAreaElement
          >("input:invalid, textarea:invalid, select:invalid")
        : null;
    if (invalid) {
      const targetSection = invalid.closest<HTMLElement>(
        "[data-preference-section]",
      )?.dataset.preferenceSection as PreferenceSection | undefined;
      if (targetSection) setSection(targetSection);
      requestAnimationFrame(() => {
        invalid.focus();
        invalid.reportValidity();
      });
      return;
    }
    save.mutate();
  }
  return (
    <AppShell profile={profile} title="Preferences" contentScrollable={false}>
      <SettingsLayout activeSection={section} kind="preferences">
        {preferences.isLoading ? (
          <PreferencesSkeleton />
        ) : preferences.error && !preferences.data ? (
          <ErrorState
            title="Could not load preferences"
            message={preferences.error.message}
            onRetry={() => preferences.refetch()}
          />
        ) : (
          <form
            id="preferences-form"
            noValidate
            className="min-w-0"
            onSubmit={submit}
          >
            <fieldset disabled={save.isPending}>
              {!localTransport && (
                <section
                  data-preference-section="reviews"
                  hidden={section !== "reviews"}
                  aria-labelledby="reviews-section-title"
                >
                  <h2
                    id="reviews-section-title"
                    className="border-b border-line pb-4 text-section font-semibold tracking-[-0.02em]"
                  >
                    Code reviews
                  </h2>
                  <PreferenceRow label="Codex model" htmlFor="codex-model">
                    <div className="space-y-2">
                      <Input
                        id="codex-model"
                        list="codex-model-options"
                        value={form.codexModel}
                        required
                        maxLength={160}
                        onChange={(e) => update("codexModel", e.target.value)}
                        className="w-full"
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
                      {codexModels.isLoading && (
                        <p className="text-supporting text-muted">
                          Loading available models…
                        </p>
                      )}
                      {codexModels.error && (
                        <p className="text-supporting text-muted">
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
                  </PreferenceRow>
                </section>
              )}
              <PreferencesFields
                section={section}
                values={form}
                updatedAt={preferences.data?.developerContextUpdatedAt}
                importAction={
                  <ResumeImport
                    key={profile.id}
                    profileId={profile.id}
                    values={form}
                    disabled={save.isPending}
                    onApply={(value) => {
                      setEdits(value);
                      setSaved(false);
                      save.reset();
                    }}
                  />
                }
                onChange={update}
                disabled={save.isPending}
              />
            </fieldset>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={!dirty || save.isPending}
                onClick={() => {
                  setEdits(null);
                  setSaved(false);
                  save.reset();
                }}
              >
                Discard changes
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!dirty || save.isPending}
              >
                {save.isPending && (
                  <LoaderCircle size={15} className="animate-spin" />
                )}
                {save.isPending ? "Saving…" : "Save preferences"}
              </Button>
            </div>
            <div className="mt-3 min-h-6" aria-live="polite">
              {dirty && !save.isPending && !save.error && (
                <p className="text-supporting text-muted">Unsaved changes</p>
              )}
              {saved && (
                <p className="flex items-center gap-1.5 text-supporting text-success">
                  <Check
                    size={14}
                    className="feedback-check shrink-0"
                    aria-hidden="true"
                  />
                  Preferences saved
                </p>
              )}
              {save.error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-ui leading-6 text-destructive"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {save.error.message}
                </p>
              )}
            </div>
          </form>
        )}
      </SettingsLayout>
    </AppShell>
  );
}
