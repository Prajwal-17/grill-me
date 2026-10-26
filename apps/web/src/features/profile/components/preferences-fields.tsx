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

export type PreferenceSection = "profile" | "practice" | "projects" | "reviews";
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

export function PreferenceRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2 border-b border-line py-4 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="pt-1.5 text-ui font-medium">
          {label}
        </label>
      ) : (
        <div className="pt-1.5 text-ui font-medium">{label}</div>
      )}
      <div className="min-w-0 [&_input]:text-ui [&_textarea]:text-ui [&_[role=combobox]]:h-9 [&>div>span[id]]:sr-only">
        {children}
      </div>
    </div>
  );
}

export function PreferencesFields({
  values,
  onChange,
  disabled = false,
  importAction,
  updatedAt,
  section = "profile",
}: {
  values: PreferenceValues;
  onChange: <K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) => void;
  disabled?: boolean;
  importAction?: ReactNode;
  updatedAt?: string | null;
  section?: PreferenceSection;
}) {
  return (
    <>
      <section
        data-preference-section="profile"
        hidden={section !== "profile"}
        aria-labelledby="profile-section-title"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <h2
            id="profile-section-title"
            className="text-section font-semibold tracking-[-0.02em]"
          >
            Developer profile
          </h2>
          {importAction}
        </div>
        <PreferenceRow label="Name" htmlFor="preference-name">
          <Input
            id="preference-name"
            value={values.displayName ?? ""}
            maxLength={120}
            disabled={disabled}
            autoComplete="name"
            onChange={(e) => onChange("displayName", e.target.value || null)}
          />
        </PreferenceRow>
        <PreferenceRow label="Experience">
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
        </PreferenceRow>
        <PreferenceRow label="Languages">
          <MultiSelect
            label="Languages"
            options={LANGUAGES}
            value={values.languages}
            allowCustom
            disabled={disabled}
            onChange={(value) => onChange("languages", value)}
          />
        </PreferenceRow>
        <PreferenceRow label="Stack">
          <MultiSelect
            label="Stack"
            options={STACK}
            value={values.stack}
            allowCustom
            disabled={disabled}
            onChange={(value) => onChange("stack", value)}
          />
        </PreferenceRow>
        <PreferenceRow label="Background" htmlFor="preference-background">
          <Textarea
            id="preference-background"
            value={values.aboutMe ?? ""}
            maxLength={4000}
            rows={4}
            disabled={disabled}
            onChange={(e) => onChange("aboutMe", e.target.value || null)}
          />
        </PreferenceRow>
        {updatedAt && (
          <p className="mt-4 text-supporting text-muted">
            Context updated{" "}
            <time dateTime={updatedAt}>
              {new Date(updatedAt).toLocaleString()}
            </time>
          </p>
        )}
      </section>
      <section
        data-preference-section="practice"
        hidden={section !== "practice"}
        aria-labelledby="practice-section-title"
      >
        <h2
          id="practice-section-title"
          className="border-b border-line pb-4 text-section font-semibold tracking-[-0.02em]"
        >
          Practice
        </h2>
        <PreferenceRow label="Learning goals">
          <MultiSelect
            label="Learning goals"
            options={GOALS}
            value={values.learningGoals}
            disabled={disabled}
            onChange={(value) => onChange("learningGoals", value)}
          />
        </PreferenceRow>
        <PreferenceRow label="Current focus">
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
        </PreferenceRow>
        <PreferenceRow label="Learning goal" htmlFor="preference-goal">
          <Textarea
            id="preference-goal"
            value={values.learningGoal ?? ""}
            maxLength={1000}
            disabled={disabled}
            onChange={(e) => onChange("learningGoal", e.target.value || null)}
            rows={3}
          />
        </PreferenceRow>
        <PreferenceRow label="Known concepts" htmlFor="preference-concepts">
          <Textarea
            id="preference-concepts"
            value={values.knownConcepts.join("\n")}
            disabled={disabled}
            onChange={(e) =>
              onChange("knownConcepts", e.target.value.split("\n"))
            }
            rows={3}
            aria-describedby="concepts-hint"
          />
          <p id="concepts-hint" className="mt-1.5 text-supporting text-muted">
            One per line
          </p>
        </PreferenceRow>
        <PreferenceRow label="Topic familiarity">
          <div className="space-y-2">
            {values.topicFamiliarity.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 [&>[role=combobox]]:col-start-1 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:[&>[role=combobox]]:col-start-auto"
              >
                <Input
                  aria-label={`Topic ${index + 1}`}
                  className="min-w-[120px] flex-1"
                  value={item.topic}
                  maxLength={200}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.map((value, i) =>
                        i === index
                          ? { ...value, topic: e.target.value }
                          : value,
                      ),
                    )
                  }
                />
                <ChoiceSelect
                  label={`Familiarity ${index + 1}`}
                  value={item.familiarity}
                  disabled={disabled}
                  options={[
                    { id: "new", label: "New" },
                    { id: "practiced", label: "Practiced" },
                    { id: "comfortable", label: "Comfortable" },
                  ]}
                  onChange={(selected) =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.map((value, i) =>
                        i === index
                          ? {
                              ...value,
                              familiarity: selected as typeof item.familiarity,
                            }
                          : value,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
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
              size="sm"
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
        </PreferenceRow>
        <PreferenceRow label="Challenge context">
          <label className="flex items-start gap-2.5 text-ui">
            <input
              type="checkbox"
              className="mt-1 accent-brand"
              checked={values.includeRecentChallenges}
              disabled={disabled}
              onChange={(e) =>
                onChange("includeRecentChallenges", e.target.checked)
              }
            />
            <span>Send recent challenges to AI</span>
          </label>
        </PreferenceRow>
      </section>
      <section
        data-preference-section="projects"
        hidden={section !== "projects"}
        aria-labelledby="projects-section-title"
      >
        <h2
          id="projects-section-title"
          className="mb-4 border-b border-line pb-4 text-section font-semibold tracking-[-0.02em]"
        >
          Projects{" "}
          <span className="ml-1 text-ui font-normal text-muted">
            {values.projects.length}
          </span>
        </h2>
        <DeveloperProjects
          value={values.projects}
          disabled={disabled}
          onChange={(value) => onChange("projects", value)}
        />
      </section>
    </>
  );
}
