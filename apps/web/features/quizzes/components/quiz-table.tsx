"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/cn";
import { useQuizListState } from "../hooks/use-quiz-list-state";
import type { QuizSummary } from "../types";

const PAGE_SIZE = 8;
const statuses = [
  ["all", "All statuses"],
  ["draft", "In progress"],
  ["submitted", "Submitted"],
  ["new", "Not started"],
] as const;

function title(quiz: QuizSummary) {
  return (
    quiz.title?.trim() ||
    quiz.topic?.trim() ||
    quiz.prompt?.trim() ||
    `Quiz ${quiz.number}`
  );
}

function status(quiz: QuizSummary) {
  return quiz.latestAttempt?.status ?? "new";
}

function action(quiz: QuizSummary) {
  return status(quiz) === "draft"
    ? "Resume"
    : status(quiz) === "submitted"
      ? "Results"
      : "Start";
}

function score(quiz: QuizSummary) {
  return quiz.latestAttempt?.score != null
    ? quiz.latestAttempt.score / quiz.questionCount
    : -1;
}

function Progress({
  quiz,
  compact = false,
}: {
  quiz: QuizSummary;
  compact?: boolean;
}) {
  const current = status(quiz);
  const Icon =
    current === "draft" ? Clock3 : current === "submitted" ? Check : Circle;
  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : undefined}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap text-xs",
          current === "draft" ? "text-warning" : "text-muted",
        )}
      >
        <Icon size={13} aria-hidden="true" />
        {current === "draft"
          ? "In progress"
          : current === "submitted"
            ? "Submitted"
            : "Not started"}
      </span>
      {current === "draft" && (
        <span
          className={cn(
            "text-xs text-muted tabular-nums",
            !compact && "mt-1 block",
          )}
        >
          {quiz.latestAttempt!.answered}/{quiz.questionCount}
          {!compact && " answered"}
        </span>
      )}
    </div>
  );
}

function Score({ quiz }: { quiz: QuizSummary }) {
  return quiz.latestAttempt?.score != null ? (
    <span className="tabular-nums">
      {quiz.latestAttempt.score}
      <span className="text-muted">/{quiz.questionCount}</span>
    </span>
  ) : (
    <span className="text-muted" aria-label="No submitted score">
      —
    </span>
  );
}

function ListSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        className="w-full min-w-0 gap-1 bg-surface px-3 text-sm shadow-none data-[size=default]:h-11 md:data-[size=default]:h-9"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function QuizTable({
  profileId,
  quizzes,
  disabled,
  actions,
  onOpen,
}: {
  profileId: string;
  quizzes: QuizSummary[];
  disabled: boolean;
  actions: ReactNode;
  onOpen: (id: string) => void;
}) {
  const [settings, update] = useQuizListState(profileId);
  const searchRef = useRef<HTMLInputElement>(null);
  const query = settings.search.trim().toLowerCase();
  const matching = quizzes.filter(
    (quiz) =>
      (settings.difficulty === "all" ||
        quiz.difficulty === settings.difficulty) &&
      (!query ||
        `quiz ${quiz.number} #${quiz.number} ${quiz.title ?? ""} ${quiz.topic ?? ""} ${quiz.prompt ?? ""}`
          .toLowerCase()
          .includes(query)),
  );
  const filtered = matching.filter(
    (quiz) => settings.status === "all" || status(quiz) === settings.status,
  );
  filtered.sort((a, b) => {
    const newest =
      b.createdAt.localeCompare(a.createdAt) || b.number - a.number;
    if (settings.sort === "oldest") return -newest;
    if (settings.sort === "name")
      return (
        title(a).localeCompare(title(b), undefined, {
          numeric: true,
          sensitivity: "base",
        }) || newest
      );
    if (settings.sort === "score") return score(b) - score(a) || newest;
    return newest;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(settings.page, pageCount);
  const offset = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(offset, offset + PAGE_SIZE);
  const hasFilters =
    query !== "" || settings.status !== "all" || settings.difficulty !== "all";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "/" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.defaultPrevented
      )
        return;
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.closest(
          'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="dialog"]',
        )
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function clearFilters() {
    update({ search: "", status: "all", difficulty: "all", page: 1 });
  }

  function openButton(quiz: QuizSummary, isAction = false) {
    return (
      <button
        type="button"
        data-quiz-open={isAction ? undefined : quiz.id}
        aria-label={`${isAction ? action(quiz) : "Open"} quiz ${quiz.number}`}
        aria-keyshortcuts={isAction ? undefined : "ArrowUp ArrowDown"}
        disabled={disabled}
        onClick={() => onOpen(quiz.id)}
        title={isAction ? undefined : title(quiz)}
        className={cn(
          "rounded-sm outline-offset-4 disabled:opacity-40",
          isAction
            ? "pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 text-xs text-muted hover:text-foreground md:min-h-8"
            : "line-clamp-2 text-left text-sm font-medium [overflow-wrap:anywhere] hover:underline hover:underline-offset-4",
          isAction && status(quiz) === "draft" && "text-foreground",
        )}
      >
        {isAction ? (
          <>
            {action(quiz)}
            <ArrowRight size={13} aria-hidden="true" />
          </>
        ) : (
          title(quiz)
        )}
      </button>
    );
  }

  return (
    <div className="space-y-3 @container/quiz-list">
      <div className="grid grid-cols-2 items-center gap-1.5 @[640px]/quiz-list:grid-cols-4 @[900px]/quiz-list:grid-cols-[minmax(0,1fr)_124px_136px_148px_auto]">
        <div
          role="search"
          className="relative col-span-2 min-w-0 @[900px]/quiz-list:col-span-1"
        >
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search quizzes"
            aria-controls="quiz-list-results"
            placeholder="Search quizzes…"
            value={settings.search}
            maxLength={200}
            disabled={disabled}
            onChange={(event) =>
              update({ search: event.target.value, page: 1 })
            }
            onKeyDown={(event) => {
              if (event.key === "Escape" && settings.search) {
                event.preventDefault();
                update({ search: "", page: 1 });
              }
            }}
            className="h-11 bg-canvas pr-10 pl-9 shadow-none md:h-9 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {settings.search && (
            <button
              type="button"
              aria-label="Clear search"
              disabled={disabled}
              onClick={() => {
                update({ search: "", page: 1 });
                searchRef.current?.focus();
              }}
              className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-foreground"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="min-w-0">
          <ListSelect
            label="Quiz status"
            value={settings.status}
            disabled={disabled}
            onChange={(value) =>
              update({ status: value as typeof settings.status, page: 1 })
            }
            options={statuses}
          />
        </div>
        <div className="min-w-0">
          <ListSelect
            label="Filter by difficulty"
            value={settings.difficulty}
            disabled={disabled}
            onChange={(value) =>
              update({
                difficulty: value as typeof settings.difficulty,
                page: 1,
              })
            }
            options={[
              ["all", "Any difficulty"],
              ["easy", "Easy"],
              ["medium", "Medium"],
              ["hard", "Hard"],
              ["grill", "Grill"],
            ]}
          />
        </div>
        <div className="min-w-0 @[640px]/quiz-list:col-span-2 @[900px]/quiz-list:col-span-1">
          <ListSelect
            label="Sort quizzes"
            value={settings.sort}
            disabled={disabled}
            onChange={(value) =>
              update({ sort: value as typeof settings.sort, page: 1 })
            }
            options={[
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
              ["name", "Name A–Z"],
              ["score", "Highest score"],
            ]}
          />
        </div>
        <div className="flex justify-end @[640px]/quiz-list:col-span-2 @[900px]/quiz-list:col-span-1">
          {actions}
        </div>
      </div>
      <div
        id="quiz-list-results"
        className="overflow-hidden rounded-lg border border-line"
        onKeyDown={(event) => {
          if (
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            (event.key !== "ArrowDown" && event.key !== "ArrowUp")
          )
            return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button[data-quiz-open]",
            ),
          ).filter((button) => button.getClientRects().length > 0);
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
        {visible.length ? (
          <>
            <Table className="hidden w-full table-fixed text-left text-xs @[640px]/quiz-list:table">
              <TableCaption className="sr-only">
                Saved quizzes. Use up and down arrows to browse, then Enter to
                open.
              </TableCaption>
              <colgroup>
                <col />
                <col className="w-20" />
                <col className="w-32" />
                <col className="w-16" />
                <col className="hidden w-20 @[850px]/quiz-list:table-column" />
                <col className="w-20" />
              </colgroup>
              <TableHeader className="border-b border-line bg-canvas text-muted">
                <TableRow>
                  <TableHead scope="col" className="h-8 px-4 py-2 font-normal">
                    Quiz
                  </TableHead>
                  <TableHead scope="col" className="h-8 px-2 py-2 font-normal">
                    Difficulty
                  </TableHead>
                  <TableHead scope="col" className="h-8 px-2 py-2 font-normal">
                    Progress
                  </TableHead>
                  <TableHead scope="col" className="h-8 px-2 py-2 font-normal">
                    Score
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="hidden h-8 px-2 py-2 font-normal @[850px]/quiz-list:table-cell"
                  >
                    Created
                  </TableHead>
                  <TableHead scope="col" className="h-8">
                    <span className="sr-only">Open quiz</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((quiz) => (
                  <TableRow
                    key={quiz.id}
                    className="border-b border-line last:border-b-0 hover:bg-canvas/60 focus-within:bg-canvas/60"
                  >
                    <TableHead
                      scope="row"
                      className="px-4 py-2 font-normal whitespace-normal"
                    >
                      {openButton(quiz)}
                      <p className="mt-1 text-xs text-muted">
                        Quiz {quiz.number} · {quiz.questionCount} questions
                      </p>
                    </TableHead>
                    <TableCell className="px-2 py-2 text-muted capitalize">
                      {quiz.difficulty ?? "—"}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Progress quiz={quiz} />
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Score quiz={quiz} />
                    </TableCell>
                    <TableCell className="hidden px-2 py-2 text-muted @[850px]/quiz-list:table-cell">
                      <time
                        dateTime={quiz.createdAt}
                        title={new Date(quiz.createdAt).toLocaleDateString()}
                      >
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          day: "numeric",
                        }).format(new Date(quiz.createdAt))}
                      </time>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {openButton(quiz, true)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="divide-y divide-line @[640px]/quiz-list:hidden">
              {visible.map((quiz) => (
                <article key={quiz.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {openButton(quiz)}
                      <p className="mt-1 text-xs text-muted">
                        Quiz {quiz.number} · {quiz.questionCount} questions
                        {quiz.difficulty && (
                          <>
                            {" "}
                            ·{" "}
                            <span className="capitalize">
                              {quiz.difficulty}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    {openButton(quiz, true)}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <Progress quiz={quiz} compact />
                    {quiz.latestAttempt?.score != null && (
                      <span className="text-xs">
                        <Score quiz={quiz} />
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-3 px-4 py-12 text-center text-sm text-muted">
            <p>{quizzes.length ? "No quizzes found." : "No quizzes yet."}</p>
            {hasFilters && (
              <Button size="sm" disabled={disabled} onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex min-h-8 items-center justify-between gap-3 text-xs text-muted">
        <p role="status" aria-live="polite">
          {filtered.length
            ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, filtered.length)} of ${filtered.length}`
            : "0 quizzes"}
          <span className="sr-only">{filtered.length ? " quizzes" : ""}</span>
        </p>
        {pageCount > 1 && (
          <nav aria-label="Quiz pages" className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous page"
              disabled={disabled || page === 1}
              onClick={() => update({ page: page - 1 })}
            >
              <ChevronLeft size={15} />
            </Button>
            <span className="tabular-nums">
              {page}/{pageCount}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Next page"
              disabled={disabled || page === pageCount}
              onClick={() => update({ page: page + 1 })}
            >
              <ChevronRight size={15} />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
