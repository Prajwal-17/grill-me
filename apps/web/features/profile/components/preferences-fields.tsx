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
import type { ProfilePreferences } from "@/shared/types/api";
import { MultiSelect } from "@/shared/components/ui/multi-select";
import { ChoiceSelect } from "@/shared/components/ui/choice-select";
import { Textarea } from "@/shared/components/ui/textarea";

export type PreferenceValues = Omit<
  ProfilePreferences,
  "profileId" | "updatedAt"
>;
export const DEFAULT_PREFERENCES: PreferenceValues = {
  ...EMPTY_GUIDED,
  aboutMe: null,
};

export function preferenceValues(
  preferences: ProfilePreferences,
): PreferenceValues {
  const { profileId: _id, updatedAt: _date, ...values } = preferences;
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
      <section className="grid gap-6 border-b border-line py-7 md:grid-cols-[150px_minmax(0,1fr)]">
        <h2 className="text-[15px] font-semibold">Background</h2>
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
      <section className="grid gap-6 border-b border-line py-7 md:grid-cols-[150px_minmax(0,1fr)]">
        <h2 className="text-[15px] font-semibold">Direction</h2>
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
        </div>
      </section>
      <section className="grid gap-6 border-b border-line py-7 md:grid-cols-[150px_minmax(0,1fr)]">
        <h2 className="text-[15px] font-semibold">Learning context</h2>
        <div className="grid gap-5">
          <label className="grid gap-2 text-sm">
            Your learning goal
            <Textarea
              value={values.learningGoal ?? ""}
              disabled={disabled}
              onChange={(e) => onChange("learningGoal", e.target.value || null)}
              placeholder="Build backend services independently"
              rows={2}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Known concepts{" "}
            <span className="text-xs text-muted">One per line</span>
            <Textarea
              value={values.knownConcepts.join("\n")}
              disabled={disabled}
              onChange={(e) =>
                onChange("knownConcepts", e.target.value.split("\n"))
              }
              placeholder={"Functions\nMaps\nHTTP"}
              rows={3}
            />
          </label>
          <div className="grid gap-2">
            <p className="text-sm">Familiarity by topic</p>
            {values.topicFamiliarity.map((item, index) => (
              <div key={index} className="flex gap-2">
                <input
                  aria-label={"Topic " + (index + 1)}
                  value={item.topic}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.map((v, i) =>
                        i === index ? { ...v, topic: e.target.value } : v,
                      ),
                    )
                  }
                  placeholder="Go channels"
                  className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-2 text-sm"
                />
                <select
                  aria-label={"Familiarity " + (index + 1)}
                  value={item.familiarity}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.map((v, i) =>
                        i === index
                          ? {
                              ...v,
                              familiarity: e.target
                                .value as typeof item.familiarity,
                            }
                          : v,
                      ),
                    )
                  }
                  className="rounded border border-line bg-surface px-2 text-sm"
                >
                  <option value="new">New</option>
                  <option value="practiced">Practiced</option>
                  <option value="comfortable">Comfortable</option>
                </select>
                <button
                  type="button"
                  aria-label={"Remove topic " + (index + 1)}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      "topicFamiliarity",
                      values.topicFamiliarity.filter((_, i) => i !== index),
                    )
                  }
                  className="px-2 text-muted"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={disabled}
              className="justify-self-start text-sm underline underline-offset-4"
              onClick={() =>
                onChange("topicFamiliarity", [
                  ...values.topicFamiliarity,
                  { topic: "", familiarity: "new" },
                ])
              }
            >
              Add topic
            </button>
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
                placeholder="Anything else your builds should take into account"
                className="mt-4 min-h-24 resize-none leading-6"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
