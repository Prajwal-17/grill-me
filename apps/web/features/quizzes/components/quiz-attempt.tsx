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
      className="group/attempt rounded-md outline-none"
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
      <div className="mb-3 flex items-center justify-between gap-4 text-sm">
        <p
          className="font-medium group-focus-visible/attempt:underline group-focus-visible/attempt:underline-offset-4"
          aria-live="polite"
        >
          Question {index + 1} of {quiz.questionCount}
        </p>
        <p className="text-muted tabular-nums">
          {submitted ? (
            <>
              <strong className="font-medium text-foreground">
                {attempt.score}/{quiz.questionCount}
              </strong>{" "}
              correct
            </>
          ) : (
            `${answered}/${quiz.questionCount} answered`
          )}
        </p>
      </div>
      <div className="mb-7 flex gap-1.5" aria-hidden="true">
        {quiz.questions.map((q, i) => (
          <span
            key={q.id}
            className={cn(
              "h-[3px] flex-1 rounded-full",
              submitted
                ? "bg-line"
                : state.answers[q.id] !== undefined
                  ? "bg-foreground"
                  : i === index
                    ? "bg-muted"
                    : "bg-line",
            )}
          />
        ))}
      </div>
      <div className="grid min-w-0 gap-7 @[850px]/quiz:grid-cols-[minmax(0,1fr)_170px] @[850px]/quiz:gap-8">
        <div className="min-w-0">
          <fieldset
            disabled={submitted || state.submitting}
            className="min-w-0 space-y-3"
          >
            <legend className="mb-6 w-full text-xl font-medium leading-relaxed tracking-tight md:text-2xl">
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
                    "relative flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-4 text-base leading-relaxed transition-colors duration-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-foreground",
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
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border font-mono text-xs",
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
              className="mt-6 border-t border-line pt-5 text-base leading-7"
            >
              <h3 className="mb-2 text-sm font-medium">Explanation</h3>
              <div className="text-muted">
                <Markdown>{result.explanation}</Markdown>
              </div>
            </section>
          )}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <div className="flex gap-2">
              <Button
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ArrowLeft size={15} />
                Previous
              </Button>
              <Button
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
              className="mt-3 text-xs text-muted"
            >
              {answered < quiz.questionCount ? (
                <>
                  {quiz.questionCount - answered} unanswered ·{" "}
                  <button
                    type="button"
                    className="min-h-8 underline underline-offset-4 hover:text-foreground"
                    onClick={() =>
                      setIndex(
                        quiz.questions.findIndex(
                          (q) => state.answers[q.id] === undefined,
                        ),
                      )
                    }
                  >
                    Go to next unanswered question
                  </button>
                </>
              ) : (
                "All questions answered. Ready to submit."
              )}
            </p>
          )}
        </div>
        <aside
          aria-label="Question overview"
          className="order-first border-b border-line pb-6 @[850px]/quiz:order-last @[850px]/quiz:border-b-0 @[850px]/quiz:border-l @[850px]/quiz:pb-0 @[850px]/quiz:pl-6"
        >
          <div className="mb-4 flex items-center justify-between gap-2 @[850px]/quiz:block">
            <h3 className="text-sm font-medium">Overview</h3>
            <p className="text-xs text-muted @[850px]/quiz:mt-1">
              {submitted
                ? "Submitted"
                : `${answered}/${quiz.questionCount} answered`}
            </p>
          </div>
          <nav
            aria-label="Quiz questions"
            className="grid grid-cols-5 gap-2 sm:grid-cols-10 @[850px]/quiz:grid-cols-3"
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
                <button
                  key={q.id}
                  type="button"
                  aria-label={`Question ${i + 1}, ${questionResult ? (correct ? "correct" : "incorrect") : isAnswered ? "answered" : "unanswered"}`}
                  aria-current={index === i ? "step" : undefined}
                  onClick={() => setIndex(i)}
                  className={cn(
                    "pressable relative flex min-h-11 items-center justify-center gap-1 rounded-md border text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-foreground",
                    questionResult
                      ? correct
                        ? "border-success/50 bg-success/10 text-success"
                        : "border-destructive/50 bg-destructive/10 text-destructive"
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
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      <X size={12} aria-hidden="true" />
                    )
                  ) : (
                    isAnswered && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-1 h-0.5 w-3 rounded-full bg-foreground"
                      />
                    )
                  )}
                </button>
              );
            })}
          </nav>
          {submitted ? (
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-success">
                <Check size={12} aria-hidden="true" />
                Correct
              </span>
              <span className="inline-flex items-center gap-1 text-destructive">
                <X size={12} aria-hidden="true" />
                Incorrect
              </span>
            </div>
          ) : (
            <p className="mt-4 hidden text-xs leading-5 text-muted @[850px]/quiz:block">
              ← → questions
              <br />↑ ↓ choose an answer
              <br />
              Answers save automatically
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
