"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  generateQuiz,
  getQuiz,
  getQuizzes,
  quizKeys,
  startQuizAttempt,
} from "../api/quiz-api";
import {
  COVERAGE_LABELS,
  type GenerateQuizRequest,
  type QuestionCount,
  type QuizAttempt as Attempt,
  type QuizCoverage,
  type QuizDetail,
  type QuizSummary,
} from "../types";
import { QuizAttempt } from "./quiz-attempt";

function QuizSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        size="sm"
        className="max-w-full border-line bg-surface shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function quizLabel(quiz: QuizSummary) {
  const attempt = quiz.latestAttempt;
  const progress = attempt
    ? attempt.status === "submitted"
      ? ` · ${attempt.score}/${quiz.questionCount}`
      : ` · ${attempt.answered}/${quiz.questionCount} answered`
    : " · Not started";
  return `Quiz ${quiz.number} · ${quiz.questionCount} questions${progress}`;
}

export function QuizWorkspace({
  profileId,
  challengeId,
}: {
  profileId: string;
  challengeId: string;
}) {
  const queries = useQueryClient();
  const [quizId, setQuizId] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState<QuestionCount>(10);
  const [coverage, setCoverage] = useState<QuizCoverage>("mixed");
  const [changing, setChanging] = useState(false);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const requestRef = useRef<GenerateQuizRequest | null>(null);
  const registerSave = useCallback((save: (() => Promise<void>) | null) => {
    saveRef.current = save;
  }, []);
  const listKey = quizKeys.list(profileId, challengeId);
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => getQuizzes(profileId, challengeId),
  });
  const selectedQuizId =
    list.data?.find((quiz) => quiz.id === quizId)?.id ??
    list.data?.[0]?.id ??
    "";
  const detailKey = quizKeys.detail(profileId, challengeId, selectedQuizId);
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => getQuiz(profileId, challengeId, selectedQuizId),
    enabled: Boolean(selectedQuizId),
    refetchOnWindowFocus: false,
  });
  const selectedAttempt =
    detail.data?.attempts.find((attempt) => attempt.id === attemptId) ??
    detail.data?.attempts[0];

  function updateAttempt(attempt: Attempt) {
    queries.setQueryData<QuizDetail>(
      quizKeys.detail(profileId, challengeId, attempt.quizId),
      (current) => {
        if (!current) return current;
        const previous = current.attempts.find(
          (item) => item.id === attempt.id,
        );
        if (previous && previous.revision > attempt.revision) return current;
        return {
          ...current,
          attempts: [
            attempt,
            ...current.attempts.filter((item) => item.id !== attempt.id),
          ].sort((a, b) => b.number - a.number),
        };
      },
    );
    queries.setQueryData<QuizSummary[]>(listKey, (current) =>
      current?.map((quiz) =>
        quiz.id === attempt.quizId &&
        (!quiz.latestAttempt || quiz.latestAttempt.number <= attempt.number)
          ? {
              ...quiz,
              latestAttempt: {
                number: attempt.number,
                status: attempt.status,
                answered: Object.keys(attempt.answers).length,
                score: attempt.score,
              },
            }
          : quiz,
      ),
    );
  }

  const generation = useMutation({
    mutationFn: async () => {
      await saveRef.current?.();
      const previous = requestRef.current;
      const request =
        previous?.questionCount === questionCount &&
        previous.coverage === coverage
          ? previous
          : { requestId: crypto.randomUUID(), questionCount, coverage };
      requestRef.current = request;
      return generateQuiz(profileId, challengeId, request);
    },
    onSuccess: (quiz) => {
      requestRef.current = null;
      queries.setQueryData<QuizDetail>(
        quizKeys.detail(profileId, challengeId, quiz.id),
        { quiz, attempts: [] },
      );
      const { questions: _questions, ...summary } = quiz;
      queries.setQueryData<QuizSummary[]>(listKey, (current) => [
        { ...summary, latestAttempt: null },
        ...(current ?? []).filter((item) => item.id !== quiz.id),
      ]);
      setQuizId(quiz.id);
      setAttemptId("");
      setDialogOpen(false);
      void queries.invalidateQueries({ queryKey: listKey });
    },
  });
  const start = useMutation({
    mutationFn: () => startQuizAttempt(profileId, challengeId, selectedQuizId),
    onSuccess: (attempt) => {
      updateAttempt(attempt);
      setAttemptId(attempt.id);
    },
  });
  async function select(value: string, kind: "quiz" | "attempt") {
    setChanging(true);
    try {
      await saveRef.current?.();
      if (kind === "quiz") {
        setQuizId(value);
        setAttemptId("");
        start.reset();
      } else setAttemptId(value);
    } catch {
      /* The toast reports the save error; keep the current attempt visible. */
    } finally {
      setChanging(false);
    }
  }
  const busy = changing || generation.isPending || start.isPending;

  return (
    <section
      aria-label="Challenge quizzes"
      className="mx-auto w-full max-w-[820px] space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {selectedQuizId ? (
          <QuizSelect
            label="Select quiz"
            value={selectedQuizId}
            disabled={busy}
            onChange={(value) => {
              void select(value, "quiz");
            }}
            options={(list.data ?? []).map((quiz) => ({
              value: quiz.id,
              label: quizLabel(quiz),
            }))}
          />
        ) : (
          <h2 className="text-sm font-medium">Quizzes</h2>
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={busy || list.isLoading}
          onClick={() => {
            generation.reset();
            setDialogOpen(true);
          }}
        >
          <Plus size={14} />
          Generate quiz
        </Button>
      </div>
      {list.isLoading ? (
        <p role="status" className="text-sm text-muted">
          Loading quizzes…
        </p>
      ) : list.error ? (
        <div role="alert" className="text-sm text-muted">
          <p>{list.error.message}</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => {
              void list.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : !selectedQuizId ? (
        <p className="text-sm text-muted">No quizzes yet.</p>
      ) : detail.isLoading ? (
        <p role="status" className="text-sm text-muted">
          Loading quiz…
        </p>
      ) : detail.error ? (
        <div role="alert" className="text-sm text-muted">
          <p>{detail.error.message}</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => {
              void detail.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        detail.data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <p className="text-xs text-muted">
                {COVERAGE_LABELS[detail.data.quiz.coverage]} ·{" "}
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(detail.data.quiz.createdAt))}
              </p>
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {selectedAttempt && (
                  <QuizSelect
                    label="Select quiz attempt"
                    value={selectedAttempt.id}
                    disabled={busy}
                    onChange={(value) => {
                      void select(value, "attempt");
                    }}
                    options={detail.data.attempts.map((attempt) => ({
                      value: attempt.id,
                      label: `Attempt ${attempt.number} · ${attempt.status === "submitted" ? `${attempt.score}/${detail.data.quiz.questionCount}` : "In progress"}`,
                    }))}
                  />
                )}
                {selectedAttempt?.status === "submitted" && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => start.mutate()}
                  >
                    {start.isPending ? "Starting…" : "Retake quiz"}
                  </Button>
                )}
              </div>
            </div>
            {start.error && (
              <p role="alert" className="text-xs text-destructive">
                {start.error.message}
              </p>
            )}
            {selectedAttempt ? (
              <QuizAttempt
                key={selectedAttempt.id}
                profileId={profileId}
                quiz={detail.data.quiz}
                attempt={selectedAttempt}
                onSaved={updateAttempt}
                registerSave={registerSave}
              />
            ) : (
              <Button size="sm" disabled={busy} onClick={() => start.mutate()}>
                {start.isPending ? "Starting…" : "Start quiz"}
              </Button>
            )}
          </>
        )
      )}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!generation.isPending) setDialogOpen(open);
        }}
      >
        <DialogContent
          className="sm:max-w-sm"
          showCloseButton={!generation.isPending}
        >
          <DialogTitle>Generate quiz</DialogTitle>
          <DialogDescription className="sr-only">
            Choose question count and coverage for a new quiz.
          </DialogDescription>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <p className="text-xs text-muted">Questions</p>
              <QuizSelect
                label="Question count"
                value={String(questionCount)}
                disabled={generation.isPending}
                onChange={(value) =>
                  setQuestionCount(Number(value) as QuestionCount)
                }
                options={[5, 10, 15].map((count) => ({
                  value: String(count),
                  label: String(count),
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted">Coverage</p>
              <QuizSelect
                label="Quiz coverage"
                value={coverage}
                disabled={generation.isPending}
                onChange={(value) => setCoverage(value as QuizCoverage)}
                options={Object.entries(COVERAGE_LABELS).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </div>
          </div>
          {generation.error && (
            <p role="alert" className="text-xs text-destructive">
              {generation.error.message}
            </p>
          )}
          <Button
            variant="primary"
            disabled={generation.isPending}
            onClick={() => generation.mutate()}
          >
            {generation.isPending ? "Generating…" : "Generate quiz"}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
