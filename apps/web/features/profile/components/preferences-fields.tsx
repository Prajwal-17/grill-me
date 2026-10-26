import {
  EMPTY_GUIDED,
  EXPERIENCE,
  LANGUAGES,
  STACK,
  GOALS,
  FOCUS,
} from "@repo/preferences";
import type { ReactNode } from "react";
import type { ProfilePreferences } from "@/shared/types/api";
import { MultiSelect } from "@/shared/components/ui/multi-select";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Textarea } from "@/shared/components/ui/textarea";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { DeveloperProjects } from "./developer-projects";

export type PreferenceValues = Omit<
  ProfilePreferences,
  "profileId" | "updatedAt" | "developerContextUpdatedAt"
>;
export const DEFAULT_PREFERENCES: PreferenceValues = {
  ...EMPTY_GUIDED,
  aboutMe: null,
};
export function preferenceValues(
  preferences: ProfilePreferences,
): PreferenceValues {
  const {
    profileId: _id,
    updatedAt: _date,
    developerContextUpdatedAt: _contextDate,
    ...values
  } = preferences;
  return values;
}

export function PreferencesFields({
  values,
  onChange,
  disabled = false,
  importAction,
  updatedAt,
}: {
  values: PreferenceValues;
  onChange: <K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) => void;
  disabled?: boolean;
  importAction?: ReactNode;
  updatedAt?: string | null;
}) {
  return (
    <div>
      <section className="border-b border-line py-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Developer profile</h2>
          {importAction}
        </div>
        <div className="grid gap-5 md:ml-[174px]">
          <label className="grid gap-2 text-sm font-medium">
            Name{" "}
            <span className="text-xs font-normal text-muted">
              Optional · used for profile presentation
            </span>
            <Input
              value={values.displayName ?? ""}
              maxLength={120}
              disabled={disabled}
              autoComplete="name"
              onChange={(event) =>
                onChange("displayName", event.target.value || null)
              }
            />
          </label>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Experience</span>
            <ChoiceSelect
              label="Experience"
              disabled={disabled}
              value={values.experienceLevel ?? ""}
              options={[{ id: "", label: "Not set" }, ...EXPERIENCE]}
              onChange={(value) =>
                onChange(
                  "experienceLevel",
                  (value || null) as PreferenceValues["experienceLevel"],
                )
              }
            />
          </div>
          <MultiSelect
            label="Languages"
            options={LANGUAGES}
            value={values.languages}
            allowCustom
            disabled={disabled}
            onChange={(value) => onChange("languages", value)}
          />
          <MultiSelect
            label="Stack"
            options={STACK}
            value={values.stack}
            allowCustom
            disabled={disabled}
            onChange={(value) => onChange("stack", value)}
          />
          <label className="grid gap-2 text-sm font-medium">
            Background{" "}
            <span className="text-xs font-normal text-muted">
              Optional · a short professional summary
            </span>
            <Textarea
              value={values.aboutMe ?? ""}
              maxLength={4000}
              rows={3}
              disabled={disabled}
              onChange={(event) =>
                onChange("aboutMe", event.target.value || null)
              }
            />
          </label>
          <p className="text-xs text-muted">
            {updatedAt ? (
              <>
                Context last updated{" "}
                <time dateTime={updatedAt}>
                  {new Date(updatedAt).toLocaleString()}
                </time>
              </>
            ) : (
              "Context last updated: unknown"
            )}
          </p>
        </div>
      </section>
      <details className="border-b border-line py-6">
        <summary className="cursor-pointer text-sm font-medium">
          Projects{" "}
          <span className="ml-2 text-xs font-normal text-muted">
            Optional
            {values.projects.length ? ` · ${values.projects.length}` : ""}
          </span>
        </summary>
        <div className="mt-5 md:ml-[174px]">
          <DeveloperProjects
            value={values.projects}
            disabled={disabled}
            onChange={(value) => onChange("projects", value)}
          />
        </div>
      </details>
      <details className="border-b border-line py-6">
        <summary className="cursor-pointer text-sm font-medium">
          Practice context{" "}
          <span className="ml-2 text-xs font-normal text-muted">Optional</span>
        </summary>
        <div className="mt-5 grid gap-5 md:ml-[174px]">
          <MultiSelect
            label="Learning goals"
            options={GOALS}
            value={values.learningGoals}
            disabled={disabled}
            onChange={(value) => onChange("learningGoals", value)}
          />
          <div className="grid gap-2">
            <span className="text-sm font-medium">Current focus</span>
            <ChoiceSelect
              label="Current focus"
              disabled={disabled}
              value={values.currentFocus ?? ""}
              options={[{ id: "", label: "Let my request decide" }, ...FOCUS]}
              onChange={(value) =>
                onChange(
                  "currentFocus",
                  (value || null) as PreferenceValues["currentFocus"],
                )
              }
            />
          </div>
          <label className="grid gap-2 text-sm">
            Your learning goal
            <Textarea
              value={values.learningGoal ?? ""}
              maxLength={1000}
              disabled={disabled}
              onChange={(event) =>
                onChange("learningGoal", event.target.value || null)
              }
              rows={2}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Known concepts{" "}
            <span className="text-xs text-muted">One per line</span>
            <Textarea
              value={values.knownConcepts.join("\n")}
              disabled={disabled}
              onChange={(event) =>
                onChange("knownConcepts", event.target.value.split("\n"))
              }
              rows={3}
            />
          </label>
          <div className="grid gap-3">
            <p className="text-sm font-medium">Familiarity by topic</p>
            {values.topicFamiliarity.map((item, index) => (
              <div key={index} className="flex flex-wrap gap-2">
                <Input
                  aria-label={`Topic ${index + 1}`}
                  className="min-w-0 flex-1"
                  value={item.topic}
                  maxLength={200}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.map((value, i) =>
                        i === index
                          ? { ...value, topic: event.target.value }
                          : value,
                      ),
                    )
                  }
                />
                <select
                  aria-label={`Familiarity ${index + 1}`}
                  value={item.familiarity}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.map((value, i) =>
                        i === index
                          ? {
                              ...value,
                              familiarity: event.target
                                .value as typeof item.familiarity,
                            }
                          : value,
                      ),
                    )
                  }
                  className="rounded border border-line bg-surface px-2 text-sm"
                >
                  <option value="new">New</option>
                  <option value="practiced">Practiced</option>
                  <option value="comfortable">Comfortable</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`Remove topic ${index + 1}`}
                  onClick={() =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              className="justify-self-start"
              disabled={disabled}
              onClick={() =>
                onChange("topicFamiliarity", [
                  ...values.topicFamiliarity,
                  { topic: "", familiarity: "new" },
                ])
              }
            >
              Add topic
            </Button>
          </div>
        </div>
      </details>
      <section className="grid gap-6 border-b border-line py-7 md:grid-cols-[150px_minmax(0,1fr)]">
        <h2 className="text-[15px] font-semibold">Challenge settings</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-foreground"
            checked={values.includeRecentChallenges}
            disabled={disabled}
            onChange={(event) =>
              onChange("includeRecentChallenges", event.target.checked)
            }
          />
          <span>
            Send recent challenges to AI
            <span className="mt-1 block text-xs leading-5 text-muted">
              Include recent tasks and review findings when creating challenges.
              Off keeps each new challenge independent.
            </span>
          </span>
        </label>
      </section>
    </div>
  );
}
