import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
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
import { ChoiceSelect } from "../../../shared/components/ui/choice-select";
import { Textarea } from "../../../shared/components/ui/textarea";
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
  disabled = false,
}: {
  values: PreferenceValues;
  onChange: <K extends keyof PreferenceValues>(
    key: K,
    value: PreferenceValues[K],
  ) => void;
  disabled?: boolean;
}) {
  const [notesOpen, setNotesOpen] = useState(Boolean(values.aboutMe));
  return (
    <div>
      <section className="form-section">
        <h2 className="section-heading">Background</h2>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Experience</span>
            <ChoiceSelect
              label="Experience"
              disabled={disabled}
              value={values.experienceLevel ?? ""}
              options={[{ id: "", label: "Not set" }, ...EXPERIENCE]}
              onChange={(v) =>
                onChange(
                  "experienceLevel",
                  (v || null) as PreferenceValues["experienceLevel"],
                )
              }
            />
          </div>
          <MultiSelect
            label="Languages"
            options={LANGUAGES}
            value={values.languages}
            disabled={disabled}
            onChange={(v) => onChange("languages", v)}
          />
          <MultiSelect
            label="Stack"
            options={STACK}
            value={values.stack}
            disabled={disabled}
            onChange={(v) => onChange("stack", v)}
          />
        </div>
      </section>
      <section className="form-section">
        <h2 className="section-heading">Practice</h2>
        <div className="grid gap-5">
          <MultiSelect
            label="Learning goals"
            options={GOALS}
            value={values.learningGoals}
            disabled={disabled}
            onChange={(v) => onChange("learningGoals", v)}
          />
          <div className="grid gap-2">
            <span className="text-sm font-medium">Current focus</span>
            <ChoiceSelect
              label="Current focus"
              disabled={disabled}
              value={values.currentFocus ?? ""}
              options={[{ id: "", label: "Let my request decide" }, ...FOCUS]}
              onChange={(v) =>
                onChange(
                  "currentFocus",
                  (v || null) as PreferenceValues["currentFocus"],
                )
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Duration</span>
              <ChoiceSelect
                label="Duration"
                disabled={disabled}
                value={String(values.preferredDuration)}
                options={[30, 60, 90].map((n) => ({
                  id: String(n),
                  label: n + " minutes",
                }))}
                onChange={(v) =>
                  onChange("preferredDuration", Number(v) as 30 | 60 | 90)
                }
              />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Difficulty</span>
              <ChoiceSelect
                label="Difficulty"
                disabled={disabled}
                value={values.difficulty}
                options={[
                  { id: "easy", label: "Easy" },
                  { id: "balanced", label: "Balanced" },
                  { id: "challenging", label: "Challenging" },
                ]}
                onChange={(v) => onChange("difficulty", v as Difficulty)}
              />
            </div>
          </div>
        </div>
      </section>
      <section className="py-6">
        <button
          type="button"
          aria-expanded={notesOpen}
          aria-controls="personal-notes"
          className="flex w-full items-center justify-between text-sm font-medium"
          onClick={() => setNotesOpen((v) => !v)}
        >
          <span>
            Additional context{" "}
            <span className="ml-2 text-xs font-normal text-muted">
              Optional
            </span>
          </span>
          <motion.span animate={{ rotate: notesOpen ? 180 : 0 }}>
            <ChevronDown size={15} />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {notesOpen && (
            <motion.div
              id="personal-notes"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <Textarea
                aria-label="Additional context"
                disabled={disabled}
                value={values.aboutMe ?? ""}
                onChange={(e) => onChange("aboutMe", e.target.value || null)}
                maxLength={4000}
                rows={3}
                placeholder="Anything else your exercises should take into account"
                className="mt-4 min-h-24 resize-y leading-6"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
