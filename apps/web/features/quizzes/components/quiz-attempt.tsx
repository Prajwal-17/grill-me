"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Markdown } from "@/shared/components/markdown";
import { cn } from "@/shared/lib/cn";
import { useQuizAnswers } from "../hooks/use-quiz-answers";
import type { Quiz, QuizAttempt as Attempt } from "../types";

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
  const workspaceRef = useRef<HTMLDivElement>(null);
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
    workspaceRef.current?.focus({ preventScroll: true });
  }, [submitted]);

  useEffect(() => {
    registerSave(submitted ? null : state.save);
    return () => registerSave(null);
  }, [registerSave, state.save, submitted]);

  return (
    <div
      ref={workspaceRef}
      role="group"
      aria-label="Quiz attempt"
      aria-describedby={`quiz-keys-${attempt.id}`}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
      tabIndex={0}
      className="space-y-5 rounded-md outline-offset-4"
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
          return;
        const target = event.target;
        if (
          !(target instanceof HTMLElement) ||
          target.closest(
            'textarea, select, input:not([type="radio"]), [contenteditable="true"], [role="combobox"], [role="listbox"], [role="dialog"], a',
          )
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setIndex((current) =>
            Math.max(
              0,
              Math.min(
                quiz.questions.length - 1,
                current + (event.key === "ArrowRight" ? 1 : -1),
              ),
            ),
          );
          workspaceRef.current?.focus({ preventScroll: true });
        } else if (
          !submitted &&
          !state.submitting &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          event.preventDefault();
          const selected = state.answers[question.id];
          const next =
            selected === undefined
              ? event.key === "ArrowDown"
                ? 0
                : question.options.length - 1
              : (selected +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  question.options.length) %
                question.options.length;
          state.choose(question.id, next);
          workspaceRef.current
            ?.querySelectorAll<HTMLInputElement>('input[type="radio"]')
            [next]?.focus({ preventScroll: true });
        }
      }}
    >
      <p id={`quiz-keys-${attempt.id}`} className="text-xs text-muted">
        {submitted
          ? "← → move between questions"
          : "← → questions · ↑ ↓ select an answer · Answers save automatically"}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>
          {submitted
            ? `Score: ${attempt.score}/${quiz.questionCount}`
            : `${answered}/${quiz.questionCount} answered`}
        </p>
        {submitted && <span>Submitted</span>}
      </div>
      <nav aria-label="Quiz questions" className="flex flex-wrap gap-1.5">
        {quiz.questions.map((q, i) => {
          const questionResult = attempt.results?.find(
            (item) => item.questionId === q.id,
          );
          const correct =
            questionResult &&
            questionResult.chosenOption === questionResult.correctOption;
          return (
            <button
              key={q.id}
              type="button"
              aria-label={`Question ${i + 1}${questionResult ? (correct ? ", correct" : ", incorrect") : state.answers[q.id] !== undefined ? ", answered" : ", unanswered"}`}
              aria-current={index === i ? "step" : undefined}
              onClick={() => setIndex(i)}
              className={cn(
                "relative size-8 rounded-md border text-xs",
                questionResult
                  ? correct
                    ? "border-success/50 bg-success/10 text-success"
                    : "border-destructive/50 bg-destructive/10 text-destructive"
                  : index === i
                    ? "border-foreground bg-foreground text-canvas"
                    : state.answers[q.id] !== undefined
                      ? "border-line-strong bg-elevated text-foreground"
                      : "border-line text-muted hover:bg-elevated",
                questionResult &&
                  index === i &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
              )}
            >
              {i + 1}
              {questionResult && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 rounded-full bg-surface p-0.5"
                >
                  {correct ? <Check size={10} /> : <X size={10} />}
                </span>
              )}
            </button>
          );
        })}
        {submitted && (
          <span className="sr-only">
            Check marks indicate correct answers. Crosses indicate incorrect
            answers.
          </span>
        )}
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
        {question.options.map((option, optionIndex) => {
          const correct = result?.correctOption === optionIndex;
          const incorrect = result?.chosenOption === optionIndex && !correct;
          return (
            <label
              key={optionIndex}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm leading-6",
                correct
                  ? "border-success/50 bg-success/10"
                  : incorrect
                    ? "border-destructive/50 bg-destructive/10"
                    : state.answers[question.id] === optionIndex
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
                className={cn(
                  "mt-1.5 size-3.5 shrink-0 accent-foreground",
                  correct && "accent-success",
                  incorrect && "accent-destructive",
                )}
              />
              <span className="text-muted">
                {String.fromCharCode(65 + optionIndex)}.
              </span>
              <div className="min-w-0 flex-1 break-words">
                <Markdown>{option}</Markdown>
                {correct && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                    <Check size={13} aria-hidden="true" /> Correct answer
                  </span>
                )}
                {incorrect && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                    <X size={13} aria-hidden="true" /> Your answer · Incorrect
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </fieldset>
      {result && (
        <div className="border-t border-line pt-4 text-sm leading-6">
          <p className="mb-2 text-xs font-medium text-muted">Explanation</p>
          <Markdown>{result.explanation}</Markdown>
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
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            disabled={answered !== quiz.questionCount || state.submitting}
            onClick={() => {
              void state.submit();
            }}
          >
            {state.submitting ? "Submitting…" : "Submit quiz"}
          </Button>
        )}
      </div>
    </div>
  );
}
