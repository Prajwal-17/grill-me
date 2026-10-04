"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveQuizAnswers } from "../api/quiz-api";
import type { Quiz, QuizAnswers, QuizAttempt } from "../types";

function signature(answers: QuizAnswers) {
  return JSON.stringify(
    Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)),
  );
}
function readDraft(key: string, attempt: QuizAttempt, quiz: Quiz): QuizAnswers {
  if (attempt.status === "submitted") return attempt.answers;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      !saved?.answers ||
      typeof saved.answers !== "object" ||
      Array.isArray(saved.answers)
    )
      return attempt.answers;
    const matchesRevision = saved.revision === attempt.revision;
    const completedSave =
      saved.revision + 1 === attempt.revision &&
      saved.pending &&
      signature(saved.pending) === signature(attempt.answers);
    if (!matchesRevision && !completedSave) return attempt.answers;
    const ids = new Set(quiz.questions.map((q) => q.id));
    const valid = Object.entries(saved.answers).every(
      ([id, option]) =>
        ids.has(id) &&
        Number.isInteger(option) &&
        Number(option) >= 0 &&
        Number(option) <= 3,
    );
    return valid ? saved.answers : attempt.answers;
  } catch {
    return attempt.answers;
  }
}

export function useQuizAnswers({
  profileId,
  quiz,
  attempt,
  onSaved,
}: {
  profileId: string;
  quiz: Quiz;
  attempt: QuizAttempt;
  onSaved: (attempt: QuizAttempt) => void;
}) {
  const storageKey = `grill-me.quiz.${process.env.NEXT_PUBLIC_APP_ENV ?? "development"}.${profileId}.${attempt.id}`;
  const [answers, setAnswers] = useState(() =>
    readDraft(storageKey, attempt, quiz),
  );
  const [saveState, setSaveState] = useState<
    "saved" | "unsaved" | "saving" | "failed"
  >(() =>
    signature(answers) === signature(attempt.answers) ? "saved" : "unsaved",
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const latest = useRef(answers);
  const revision = useRef(attempt.revision);
  const saved = useRef(signature(attempt.answers));
  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef<QuizAnswers | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const backup = useCallback(
    (value: QuizAnswers, currentRevision: number) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            answers: value,
            revision: currentRevision,
            pending: pending.current,
          }),
        );
      } catch {
        /* Database saving remains available when browser storage is full. */
      }
    },
    [storageKey],
  );
  const removeBackup = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Browser storage may be disabled. */
    }
  }, [storageKey]);

  const save = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      try {
        while (saved.current !== signature(latest.current)) {
          setSaveState("saving");
          setError("");
          const snapshot = { ...latest.current };
          pending.current = snapshot;
          backup(latest.current, revision.current);
          const result = await saveQuizAnswers(
            profileId,
            quiz.challengeId,
            quiz.id,
            attempt.id,
            revision.current,
            snapshot,
          );
          revision.current = result.revision;
          pending.current = null;
          saved.current = signature(result.answers);
          onSavedRef.current(result);
          if (saved.current === signature(latest.current)) removeBackup();
          else backup(latest.current, revision.current);
        }
        setSaveState("saved");
      } catch (failure) {
        setSaveState("failed");
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not save answers.",
        );
        throw failure;
      }
    };
    const promise = run();
    inFlight.current = promise;
    void promise
      .finally(() => {
        inFlight.current = null;
      })
      .catch(() => {});
    return promise;
  }, [profileId, quiz.challengeId, quiz.id, attempt.id, backup, removeBackup]);

  useEffect(() => {
    if (attempt.status === "submitted") return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [answers, attempt.status, save]);
  useEffect(
    () => () => {
      void save().catch(() => {});
    },
    [save],
  );

  function choose(questionId: string, option: number) {
    if (submitting || attempt.status === "submitted") return;
    const next = { ...latest.current, [questionId]: option };
    latest.current = next;
    setAnswers(next);
    setSaveState("unsaved");
    setError("");
    backup(next, revision.current);
  }
  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      await save();
      const result = await saveQuizAnswers(
        profileId,
        quiz.challengeId,
        quiz.id,
        attempt.id,
        revision.current,
        latest.current,
        true,
      );
      revision.current = result.revision;
      saved.current = signature(result.answers);
      removeBackup();
      onSavedRef.current(result);
      setSaveState("saved");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not submit quiz.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  function useSavedAnswers() {
    removeBackup();
    window.location.reload();
  }

  return {
    answers,
    choose,
    save,
    saveState,
    error,
    submitting,
    submit,
    useSavedAnswers,
  };
}
