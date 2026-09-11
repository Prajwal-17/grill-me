import { useState } from "react";
import {
  EMPTY_GUIDED,
  EXPERIENCE,
  LANGUAGES,
  STACK,
  GOALS,
  FOCUS,
} from "@repo/preferences";
import type { Difficulty, ProfilePreferences } from "../../../shared/types/api";
import { MultiSelect } from "../../../shared/components/ui/multi-select";
export type PreferenceValues = Omit<
  ProfilePreferences,
  "profileId" | "updatedAt" | "legacyPreferences"
>;
export const DEFAULT_PREFERENCES: PreferenceValues = {
  ...EMPTY_GUIDED,
  preferredDuration: 60,
  difficulty: "balanced",
  aboutMe: null,
};
export function preferenceValues(
  preferences: ProfilePreferences,
): PreferenceValues {
  const {
    profileId: _id,
    updatedAt: _date,
    legacyPreferences: _legacy,
    ...values
  } = preferences;
  return values;
}
export function PreferencesFields({
  values,
  onChange,
}: {
  values: PreferenceValues;
  onChange: <K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(Boolean(values.aboutMe));
  return (
    <div className="grid gap-7">
      <section className="grid gap-5">
        <h2 className="section-heading">Background</h2>
        <label className="field-label max-w-xs">
          Experience
          <select
            className="field font-normal"
            value={values.experienceLevel ?? ""}
            onChange={(event) =>
              onChange(
                "experienceLevel",
                (event.target.value ||
                  null) as PreferenceValues["experienceLevel"],
              )
            }
          >
            <option value="">Not set</option>
            {EXPERIENCE.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <MultiSelect
            label="Languages"
            options={LANGUAGES}
            value={values.languages}
            onChange={(next) => onChange("languages", next)}
          />
          <MultiSelect
            label="Stack"
            options={STACK}
            value={values.stack}
            onChange={(next) => onChange("stack", next)}
          />
        </div>
      </section>
      <section className="grid gap-5 border-t border-line pt-6">
        <h2 className="section-heading">Practice</h2>
        <div className="grid items-start gap-5 sm:grid-cols-2">
          <MultiSelect
            label="Learning goals"
            options={GOALS}
            value={values.learningGoals}
            onChange={(next) => onChange("learningGoals", next)}
          />
          <label className="field-label">
            Current focus
            <select
              className="field font-normal"
              value={values.currentFocus ?? ""}
              onChange={(event) =>
                onChange(
                  "currentFocus",
                  (event.target.value ||
                    null) as PreferenceValues["currentFocus"],
                )
              }
            >
              <option value="">Let my request decide</option>
              {FOCUS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <label className="field-label">
            Duration
            <select
              className="field font-normal"
              value={values.preferredDuration}
              onChange={(event) =>
                onChange(
                  "preferredDuration",
                  Number(event.target.value) as 30 | 60 | 90,
                )
              }
            >
              {[30, 60, 90].map((value) => (
                <option key={value} value={value}>
                  {value} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Difficulty
            <select
              className="field font-normal"
              value={values.difficulty}
              onChange={(event) =>
                onChange("difficulty", event.target.value as Difficulty)
              }
            >
              <option value="easy">Easy</option>
              <option value="balanced">Balanced</option>
              <option value="challenging">Challenging</option>
            </select>
          </label>
        </div>
      </section>
      <details
        open={notesOpen}
        onToggle={(event) => setNotesOpen(event.currentTarget.open)}
        className="border-t border-line pt-5"
      >
        <summary className="text-sm font-medium">
          Additional context{" "}
          <span className="ml-2 font-normal text-muted">Optional</span>
        </summary>
        <textarea
          aria-label="Additional context"
          value={values.aboutMe ?? ""}
          onChange={(event) => onChange("aboutMe", event.target.value || null)}
          maxLength={4000}
          rows={3}
          placeholder="Anything else your exercises should take into account"
          className="field mt-4 resize-y font-normal leading-6"
        />
      </details>
    </div>
  );
}
