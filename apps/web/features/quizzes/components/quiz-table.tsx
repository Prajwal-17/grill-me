"use client";

import { useEffect, useRef } from "react";
import type { QuizSummary } from "../types";

export function QuizTable({
  quizzes,
  disabled,
  onOpen,
}: {
  quizzes: QuizSummary[];
  disabled: boolean;
  onOpen: (id: string) => void;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tableRef.current
      ?.querySelector<HTMLButtonElement>("button[data-quiz-open]")
      ?.focus({ preventScroll: true });
  }, []);
  const inProgress = quizzes.filter(
    (quiz) => quiz.latestAttempt?.status === "draft",
  ).length;
  const submitted = quizzes.filter(
    (quiz) => quiz.latestAttempt?.status === "submitted",
  ).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {quizzes.length} saved · {inProgress} in progress · {submitted}{" "}
        submitted
      </p>
      <div
        ref={tableRef}
        className="overflow-x-auto rounded-xl border border-line"
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return;
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button[data-quiz-open]",
            ),
          );
          const index = buttons.findIndex((button) => button === event.target);
          if (index === -1) return;
          event.preventDefault();
          buttons[
            Math.max(
              0,
              Math.min(
                buttons.length - 1,
                index + (event.key === "ArrowDown" ? 1 : -1),
              ),
            )
          ]?.focus();
        }}
      >
        <table className="w-full min-w-[640px] table-fixed text-left text-xs">
          <caption className="sr-only">
            Saved quizzes. Use up and down arrows to browse, then Enter to open
            a quiz.
          </caption>
          <thead className="border-b border-line bg-canvas text-muted">
            <tr>
              <th scope="col" className="w-[38%] px-4 py-3 font-normal">
                Quiz
              </th>
              <th scope="col" className="px-3 py-3 font-normal">
                Difficulty
              </th>
              <th scope="col" className="px-3 py-3 font-normal">
                Questions
              </th>
              <th scope="col" className="w-[18%] px-3 py-3 font-normal">
                Progress
              </th>
              <th scope="col" className="px-3 py-3 font-normal">
                Score
              </th>
              <th scope="col" className="px-3 py-3 font-normal">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {quizzes.map((quiz) => (
              <tr
                key={quiz.id}
                className="border-b border-line last:border-b-0 hover:bg-canvas/60"
              >
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    data-quiz-open
                    aria-label={`Open quiz ${quiz.number}`}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    disabled={disabled}
                    onClick={() => onOpen(quiz.id)}
                    className="w-full rounded-sm text-left outline-offset-4 disabled:opacity-50"
                  >
                    <span className="mb-1 block font-medium">
                      Quiz {quiz.number}
                    </span>
                    <span className="line-clamp-2 whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">
                      {quiz.prompt ?? quiz.topic}
                    </span>
                  </button>
                </th>
                <td className="px-3 py-3 capitalize">{quiz.difficulty}</td>
                <td className="px-3 py-3">{quiz.questionCount}</td>
                <td className="px-3 py-3 text-muted">
                  {quiz.latestAttempt
                    ? quiz.latestAttempt.status === "submitted"
                      ? "Submitted"
                      : `${quiz.latestAttempt.answered}/${quiz.questionCount} answered`
                    : "Not started"}
                </td>
                <td className="px-3 py-3">
                  {quiz.latestAttempt?.score != null
                    ? `${quiz.latestAttempt.score}/${quiz.questionCount}`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-muted">
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(quiz.createdAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        ↑ ↓ browse quizzes · Enter opens a quiz
      </p>
    </div>
  );
}
