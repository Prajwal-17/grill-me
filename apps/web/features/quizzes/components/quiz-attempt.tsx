"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
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
  const correctCount =
    attempt.results?.filter((item) => item.chosenOption === item.correctOption)
      .length ?? 0;
  const incorrectCount =
    attempt.results?.filter((item) => item.chosenOption !== item.correctOption)
      .length ?? 0;

  useEffect(() => {
    workspaceRef.current?.focus({ preventScroll: true });
  }, [submitted]);

  useEffect(() => {
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
  }, [index]);

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
      className="group/attempt min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md outline-none"
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
      <p id={`quiz-keys-${attempt.id}`} className="sr-only">
        {submitted
          ? "Left and right arrows move between questions."
          : "Left and right arrows change questions. Up and down arrows select an answer. Answers save automatically."}
      </p>
      <div className="mb-2 flex items-center justify-between gap-4 text-xs sm:text-sm">
        <p
          className="font-medium group-focus-visible/attempt:underline group-focus-visible/attempt:underline-offset-4"
          aria-live="polite"
        >
          Question {index + 1} of {quiz.questionCount}
        </p>
        {!submitted && (
          <p className="text-muted tabular-nums">
            {answered}/{quiz.questionCount} answered
          </p>
        )}
      </div>
      {!submitted && (
        <div aria-hidden="true" className="mb-3 flex h-1 gap-1">
          {quiz.questions.map((item, questionIndex) => {
            const isAnswered = state.answers[item.id] !== undefined;
            return (
              <span
                key={item.id}
                className={cn(
                  "min-w-0 flex-1 rounded-full",
                  isAnswered || index === questionIndex
                    ? "bg-foreground"
                    : "bg-line",
                )}
              />
            );
          })}
        </div>
      )}
      <div className="grid min-w-0 items-start gap-4 @[850px]/quiz:grid-cols-[minmax(0,74ch)_196px] @[850px]/quiz:gap-5">
        <div className="min-w-0">
          <fieldset
            disabled={submitted || state.submitting}
            className="min-w-0 space-y-2"
          >
            <legend className="mb-3 w-full text-lg font-medium leading-[1.45] tracking-tight @[850px]/quiz:text-xl">
              <Markdown>{question.question}</Markdown>
            </legend>
            {question.options.map((option, optionIndex) => {
              const chosen = state.answers[question.id] === optionIndex;
              const correct = result?.correctOption === optionIndex;
              const incorrect =
                result?.chosenOption === optionIndex && !correct;
              return (
                <label
                  key={optionIndex}
                  className={cn(
                    "relative flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-base leading-6 transition-colors duration-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-foreground",
                    correct
                      ? "border-success/50 bg-success/10"
                      : incorrect
                        ? "border-destructive/50 bg-destructive/10"
                        : chosen
                          ? "border-foreground bg-elevated"
                          : "border-line hover:border-line-strong hover:bg-elevated",
                    (submitted || state.submitting) && "cursor-default",
                  )}
                >
                  <input
                    type="radio"
                    name={`quiz-${question.id}`}
                    value={optionIndex}
                    checked={chosen}
                    onChange={() => state.choose(question.id, optionIndex)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded border font-mono text-xs",
                      correct
                        ? "border-success/50 text-success"
                        : incorrect
                          ? "border-destructive/50 text-destructive"
                          : chosen
                            ? "border-foreground bg-foreground text-canvas"
                            : "border-line-strong text-muted",
                    )}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <div className="min-w-0 flex-1 break-words">
                    <Markdown>{option}</Markdown>
                    {correct && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                        <Check size={13} aria-hidden="true" />
                        {chosen ? "Your answer · Correct" : "Correct answer"}
                      </span>
                    )}
                    {incorrect && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                        <X size={13} aria-hidden="true" />
                        Your answer · Incorrect
                      </span>
                    )}
                  </div>
                  {!submitted && chosen && (
                    <Check
                      size={17}
                      aria-hidden="true"
                      className="mt-1.5 shrink-0"
                    />
                  )}
                </label>
              );
            })}
          </fieldset>
          {result && (
            <section
              aria-label="Answer explanation"
              className="mt-4 border-t border-line pt-3 text-base leading-6"
            >
              <h3 className="mb-1 text-sm font-semibold">Explanation</h3>
              <div className="text-muted">
                <Markdown>{result.explanation}</Markdown>
              </div>
            </section>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ArrowLeft size={15} />
                Previous
              </Button>
              <Button
                size="sm"
                variant={submitted ? "primary" : "secondary"}
                disabled={index === quiz.questions.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                Next
                <ArrowRight size={15} />
              </Button>
            </div>
            {!submitted && (
              <Button
                size="sm"
                variant="primary"
                disabled={answered !== quiz.questionCount || state.submitting}
                aria-describedby={`submit-help-${attempt.id}`}
                onClick={() => {
                  void state.submit();
                }}
              >
                {state.submitting ? "Submitting…" : "Submit quiz"}
              </Button>
            )}
          </div>
          {!submitted && (
            <p
              id={`submit-help-${attempt.id}`}
              className="mt-1.5 text-xs leading-4 text-muted"
            >
              {answered < quiz.questionCount ? (
                <>
                  {quiz.questionCount - answered} unanswered ·{" "}
                  <Button
                    type="button"
                    size="sm"
                    variant="link"
                    className="h-auto min-h-0 px-0 py-0 text-xs font-normal underline underline-offset-4 hover:text-foreground"
                    onClick={() =>
                      setIndex(
                        quiz.questions.findIndex(
                          (q) => state.answers[q.id] === undefined,
                        ),
                      )
                    }
                  >
                    Go to next unanswered question
                  </Button>
                </>
              ) : (
                "All questions answered. Ready to submit."
              )}
            </p>
          )}
        </div>
        <aside
          aria-label="Question overview"
          className="border-t border-line pt-3 @[850px]/quiz:border-t-0 @[850px]/quiz:border-l @[850px]/quiz:pt-0 @[850px]/quiz:pl-5"
        >
          <div className="mb-3 flex items-center justify-between gap-2 @[850px]/quiz:block">
            <h3 className="text-sm font-semibold">Answer overview</h3>
            <p className="text-xs leading-5 text-muted tabular-nums @[850px]/quiz:mt-1">
              {submitted
                ? `${correctCount} correct · ${incorrectCount} incorrect`
                : `${answered}/${quiz.questionCount} answered`}
            </p>
          </div>
          <nav
            aria-label="Quiz questions"
            className="grid grid-cols-5 gap-2 sm:grid-cols-10 @[850px]/quiz:grid-cols-2"
          >
            {quiz.questions.map((q, i) => {
              const questionResult = submitted
                ? attempt.results?.find((item) => item.questionId === q.id)
                : undefined;
              const correct =
                questionResult &&
                questionResult.chosenOption === questionResult.correctOption;
              const isAnswered = state.answers[q.id] !== undefined;
              return (
                <Button
                  key={q.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Question ${i + 1}, ${questionResult ? (correct ? "correct" : "incorrect") : isAnswered ? "answered" : "unanswered"}`}
                  aria-current={index === i ? "step" : undefined}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "relative h-11 w-full min-w-0 justify-center rounded-md border px-0 text-sm font-medium tabular-nums shadow-none",
                    questionResult
                      ? correct
                        ? "border-success/60 bg-success/10 text-success hover:bg-success/15"
                        : "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15"
                      : isAnswered
                        ? "border-line-strong bg-elevated text-foreground"
                        : "border-line text-muted hover:bg-elevated",
                    index === i &&
                      (questionResult
                        ? "outline-2 outline-offset-3 outline-foreground"
                        : "border-foreground text-foreground"),
                  )}
                >
                  <span>{i + 1}</span>
                  {questionResult ? (
                    correct ? (
                      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <X size={15} strokeWidth={2.5} aria-hidden="true" />
                    )
                  ) : (
                    isAnswered && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-1 h-0.5 w-3 rounded-full bg-foreground"
                      />
                    )
                  )}
                </Button>
              );
            })}
          </nav>
          {!submitted && (
            <p className="mt-3 hidden text-xs leading-5 text-muted @[850px]/quiz:block">
              ← → questions · ↑ ↓ choose · Answers save automatically
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
