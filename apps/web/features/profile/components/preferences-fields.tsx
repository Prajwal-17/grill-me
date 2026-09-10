import type { Difficulty, ProfilePreferences } from "../../../shared/types/api";

export type PreferenceValues = Omit<
  ProfilePreferences,
  "profileId" | "updatedAt"
>;

export const DEFAULT_PREFERENCES: PreferenceValues = {
  experienceLevel: null,
  languagesStack: null,
  learningGoals: null,
  preferredDuration: 60,
  difficulty: "balanced",
  aboutMe: null,
};

export function preferenceValues(
  preferences: ProfilePreferences,
): PreferenceValues {
  const {
    profileId: _profileId,
    updatedAt: _updatedAt,
    ...values
  } = preferences;
  return values;
}

const fieldClass =
  "w-full rounded-xl border border-line-strong bg-canvas/70 px-3.5 text-sm text-foreground shadow-inner shadow-black/10 outline-none transition-all duration-200 placeholder:text-dim hover:border-brand/40 focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10";

export function PreferencesFields({
  values,
  onChange,
  compact = false,
}: {
  values: PreferenceValues;
  onChange: <K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid gap-5" : "grid gap-7"}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Experience level
          <input
            value={values.experienceLevel ?? ""}
            onChange={(event) =>
              onChange("experienceLevel", event.target.value || null)
            }
            placeholder="e.g. Mid-level developer"
            maxLength={120}
            className={`${fieldClass} h-11 font-normal`}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Languages and stack
          <input
            value={values.languagesStack ?? ""}
            onChange={(event) =>
              onChange("languagesStack", event.target.value || null)
            }
            placeholder="e.g. TypeScript, React, Postgres"
            maxLength={500}
            className={`${fieldClass} h-11 font-normal`}
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Learning goals
        <textarea
          value={values.learningGoals ?? ""}
          onChange={(event) =>
            onChange("learningGoals", event.target.value || null)
          }
          placeholder="What do you want to get better at?"
          rows={compact ? 2 : 3}
          maxLength={1_000}
          className={`${fieldClass} resize-y py-3 font-normal leading-6`}
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Preferred duration
          <select
            value={values.preferredDuration}
            onChange={(event) =>
              onChange(
                "preferredDuration",
                Number(event.target.value) as 30 | 60 | 90,
              )
            }
            className={`${fieldClass} h-11 font-normal`}
          >
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
            <option value={90}>90 minutes</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Difficulty
          <select
            value={values.difficulty}
            onChange={(event) =>
              onChange("difficulty", event.target.value as Difficulty)
            }
            className={`${fieldClass} h-11 font-normal`}
          >
            <option value="easy">Easy</option>
            <option value="balanced">Balanced</option>
            <option value="challenging">Challenging</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        About me
        <span className="font-normal leading-5 text-muted">
          Background, strengths, weak spots, and learning context Grill Me
          should remember.
        </span>
        <textarea
          value={values.aboutMe ?? ""}
          onChange={(event) => onChange("aboutMe", event.target.value || null)}
          placeholder="e.g. I grasp syntax quickly, but I want more practice turning vague requirements into testable steps."
          rows={compact ? 4 : 7}
          maxLength={4_000}
          className={`${fieldClass} resize-y py-3 font-normal leading-6`}
        />
      </label>
    </div>
  );
}
