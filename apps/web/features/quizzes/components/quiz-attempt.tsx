"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Markdown } from "@/shared/components/markdown";
import { cn } from "@/shared/lib/cn";
import { useQuizAnswers } from "../hooks/use-quiz-answers";
import type { Quiz, QuizAttempt as Attempt } from "../types";

const SAVE_LABELS = {
  saved: "Saved",
  unsaved: "Unsaved",
  saving: "Saving…",
  failed: "Save failed",
};

export function QuizAttempt({
  profileId,
  quiz,
  attempt,
  onSaved,
  registerSave,
}: {
  profileId: string;
  quiz: Quiz;
  attempt: Attempt;
  onSaved: (attempt: Attempt) => void;
  registerSave: (save: (() => Promise<void>) | null) => void;
}) {
  const state = useQuizAnswers({ profileId, quiz, attempt, onSaved });
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      quiz.questions.findIndex((q) => attempt.answers[q.id] === undefined),
    ),
  );
  const question = quiz.questions[index]!;
  const submitted = attempt.status === "submitted";
  const answered = Object.keys(state.answers).length;
  const result = attempt.results?.find((r) => r.questionId === question.id);

  useEffect(() => {
    registerSave(submitted ? null : state.save);
    return () => registerSave(null);
  }, [registerSave, state.save, submitted]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>
          {submitted
            ? `Score: ${attempt.score}/${quiz.questionCount}`
            : `${answered}/${quiz.questionCount} answered`}
        </p>
        <span role="status" aria-live="polite">
          {submitted ? "Submitted" : SAVE_LABELS[state.saveState]}
        </span>
      </div>
      <nav aria-label="Quiz questions" className="flex flex-wrap gap-1.5">
        {quiz.questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            aria-label={`Question ${i + 1}${state.answers[q.id] !== undefined ? ", answered" : ", unanswered"}`}
            aria-current={index === i ? "step" : undefined}
            onClick={() => setIndex(i)}
            className={cn(
              "size-8 rounded-md border text-xs",
              index === i
                ? "border-foreground bg-foreground text-canvas"
                : state.answers[q.id] !== undefined
                  ? "border-line-strong bg-elevated text-foreground"
                  : "border-line text-muted hover:bg-elevated",
            )}
          >
            {i + 1}
          </button>
        ))}
      </nav>
      <fieldset
        disabled={submitted || state.submitting}
        className="min-w-0 space-y-3"
      >
        <legend className="mb-3 w-full text-sm leading-6">
          <span className="mb-1 block text-xs text-muted">
            Question {index + 1} of {quiz.questionCount}
          </span>
          <Markdown>{question.question}</Markdown>
        </legend>
        {question.options.map((option, optionIndex) => (
          <label
            key={optionIndex}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm leading-6",
              state.answers[question.id] === optionIndex
                ? "border-line-strong bg-elevated"
                : "border-line hover:bg-elevated",
              submitted && "cursor-default",
            )}
          >
            <input
              type="radio"
              name={`quiz-${question.id}`}
              value={optionIndex}
              checked={state.answers[question.id] === optionIndex}
              onChange={() => state.choose(question.id, optionIndex)}
              className="mt-1.5 size-3.5 shrink-0 accent-foreground"
            />
            <span className="text-muted">
              {String.fromCharCode(65 + optionIndex)}.
            </span>
            <div className="min-w-0 flex-1 break-words">
              <Markdown>{option}</Markdown>
            </div>
          </label>
        ))}
      </fieldset>
      {result && (
        <div className="border-t border-line pt-4 text-sm leading-6">
          <p className="mb-2 font-medium">
            {result.chosenOption === result.correctOption
              ? "Correct"
              : "Incorrect"}{" "}
            · Correct answer: {String.fromCharCode(65 + result.correctOption)}
          </p>
          <Markdown>{result.explanation}</Markdown>
        </div>
      )}
      {state.error && (
        <div role="alert" className="text-xs text-destructive">
          <p>{state.error}</p>
          {state.error.includes("another tab") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={state.useSavedAnswers}
              className="mt-2"
            >
              Use saved answers
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button
          size="sm"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          disabled={index === quiz.questionCount - 1}
          onClick={() => setIndex(index + 1)}
        >
          Next
        </Button>
        {!submitted && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={state.saveState === "saving" || state.submitting}
              onClick={() => {
                void state.save().catch(() => {});
              }}
            >
              Save answers
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={answered !== quiz.questionCount || state.submitting}
              onClick={() => {
                void state.submit();
              }}
            >
              {state.submitting ? "Submitting…" : "Submit quiz"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
