"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const entries = preferences
    ? [
        ["Experience", optionLabel(EXPERIENCE, preferences.experienceLevel)],
        [
          "Languages",
          optionLabels(LANGUAGES, preferences.languages).join(", "),
        ],
        ["Stack", optionLabels(STACK, preferences.stack).join(", ")],
        ["Goals", optionLabels(GOALS, preferences.learningGoals).join(", ")],
        ["Focus", optionLabel(FOCUS, preferences.currentFocus)],
        ["Context", preferences.aboutMe],
      ].filter(([, value]) => Boolean(value))
    : [];
  return (
    <section className="mt-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="practice-context"
        className="flex w-full items-center gap-2.5 rounded-lg py-3 text-left text-xs text-muted hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal size={14} />
        <span>Your practice context</span>
        {preferences && (
          <span className="ml-auto hidden gap-2 sm:flex">
            <span>{preferences.preferredDuration} min</span>
            <span className="capitalize">{preferences.difficulty}</span>
          </span>
        )}
        <motion.span
          className="ml-auto sm:ml-1"
          animate={{ rotate: open ? 180 : 0 }}
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="practice-context"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-line bg-canvas/50 p-5 text-sm">
              {loading ? (
                <p className="text-muted">Loading context…</p>
              ) : error ? (
                <p role="alert">Could not load your saved context.</p>
              ) : preferences ? (
                <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-4 gap-y-3">
                  <dt className="text-muted">Practice</dt>
                  <dd className="capitalize">
                    {preferences.difficulty}, {preferences.preferredDuration}{" "}
                    minutes
                  </dd>
                  {entries.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted">{label}</dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <Link
                href="/preferences"
                className="mt-4 inline-block text-xs underline underline-offset-4"
              >
                Edit preferences
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
