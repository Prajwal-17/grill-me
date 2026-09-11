import Link from "next/link";
import {
  EXPERIENCE,
  LANGUAGES,
  STACK,
  GOALS,
  FOCUS,
  optionLabel,
  optionLabels,
} from "@repo/preferences";
import type { ProfilePreferences } from "../../../shared/types/api";
export function PersonalContextCard({
  preferences,
  loading,
  error,
}: {
  preferences?: ProfilePreferences;
  loading: boolean;
  error?: string;
}) {
  return (
    <details className="mt-6 border-t border-line pt-4">
      <summary className="text-sm text-muted">Your practice context</summary>
      <div className="mt-4 text-sm">
        {loading ? (
          <p className="text-muted">Loading context…</p>
        ) : error ? (
          <p role="alert">Could not load your saved context.</p>
        ) : preferences ? (
          <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">Experience</dt>
            <dd>
              {optionLabel(EXPERIENCE, preferences.experienceLevel) ||
                "Not set"}
            </dd>
            <dt className="text-muted">Stack</dt>
            <dd>
              {[
                ...optionLabels(LANGUAGES, preferences.languages),
                ...optionLabels(STACK, preferences.stack),
              ].join(", ") || "Not set"}
            </dd>
            <dt className="text-muted">Goals</dt>
            <dd>
              {optionLabels(GOALS, preferences.learningGoals).join(", ") ||
                "Not set"}
            </dd>
            <dt className="text-muted">Focus</dt>
            <dd>
              {optionLabel(FOCUS, preferences.currentFocus) || "Your request"}
            </dd>
            <dt className="text-muted">Practice</dt>
            <dd className="capitalize">
              {preferences.difficulty}, {preferences.preferredDuration} minutes
            </dd>
            {preferences.aboutMe && (
              <>
                <dt className="text-muted">Context</dt>
                <dd className="whitespace-pre-wrap">{preferences.aboutMe}</dd>
              </>
            )}
          </dl>
        ) : null}
        <Link
          href="/preferences"
          className="mt-4 inline-block text-xs underline underline-offset-4"
        >
          Edit preferences
        </Link>
      </div>
    </details>
  );
}
