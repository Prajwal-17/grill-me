"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
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
  type GenerateStandaloneQuizRequest,
  type QuestionCount,
  type QuizAttempt as Attempt,
  type QuizCoverage,
  type QuizDifficulty,
  type QuizDetail,
  type QuizSummary,
} from "../types";
import { QuizAttempt } from "./quiz-attempt";
import { QuizTable } from "./quiz-table";

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
  return `${quiz.topic ? `${quiz.topic} · ` : ""}Quiz ${quiz.number} · ${quiz.questionCount} questions${progress}`;
}

export function QuizWorkspace({
  profileId,
  challengeId = null,
}: {
  profileId: string;
  challengeId?: string | null;
}) {
  const queries = useQueryClient();
  const [quizId, setQuizId] = useState("");
  const [attemptId, setAttemptId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState<QuestionCount>(10);
  const [coverage, setCoverage] = useState<QuizCoverage>("mixed");
  const [prompt, setPrompt] = useState("");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [changing, setChanging] = useState(false);
  const saveRef = useRef<(() => Promise<void>) | null>(null);
  const requestRef = useRef<{
    settings: string;
    request: GenerateQuizRequest | GenerateStandaloneQuizRequest;
  } | null>(null);
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
    (challengeId === null ? "" : list.data?.[0]?.id) ??
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
      const settings =
        challengeId === null
          ? { questionCount, prompt: prompt.trim(), difficulty }
          : { questionCount, coverage };
      const signature = JSON.stringify(settings);
      const request =
        previous?.settings === signature
          ? previous.request
          : { requestId: crypto.randomUUID(), ...settings };
      requestRef.current = { settings: signature, request };
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
      aria-label={
        challengeId === null ? "Standalone quizzes" : "Challenge quizzes"
      }
      className="mx-auto w-full space-y-6 @container/quiz"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {challengeId === null && selectedQuizId ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              void select("", "quiz");
            }}
          >
            <ArrowLeft size={14} /> All quizzes
          </Button>
        ) : selectedQuizId ? (
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
          <h2 className="text-sm font-medium">
            {challengeId === null ? "Your quizzes" : "Quizzes"}
          </h2>
        )}
        <Button
          size="sm"
          variant={selectedQuizId ? "secondary" : "primary"}
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
      ) : !selectedQuizId && list.data?.length ? (
        <QuizTable
          quizzes={list.data}
          disabled={busy}
          onOpen={(id) => {
            void select(id, "quiz");
          }}
        />
      ) : !selectedQuizId ? (
        <p className="text-sm text-muted">
          {challengeId === null
            ? "No quizzes yet. Generate your first quiz from a topic or a prompt."
            : "No quizzes yet."}
        </p>
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 basis-64">
                <h2 className="text-xl font-medium tracking-tight md:text-2xl [overflow-wrap:anywhere]">
                  {detail.data.quiz.topic ?? `Quiz ${detail.data.quiz.number}`}
                </h2>
                <p className="mt-1.5 text-sm text-muted">
                  <span className="capitalize">
                    {detail.data.quiz.coverage === "topic"
                      ? detail.data.quiz.difficulty
                      : COVERAGE_LABELS[detail.data.quiz.coverage]}
                  </span>
                  {" · "}
                  {detail.data.quiz.questionCount} questions
                </p>
              </div>
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
                    <RotateCcw size={14} />
                    {start.isPending ? "Starting…" : "Retake quiz"}
                  </Button>
                )}
              </div>
            </div>
            <details className="group text-sm">
              <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted outline-offset-4 hover:text-foreground">
                Quiz details
              </summary>
              <div className="mt-3 space-y-3 rounded-lg border border-line bg-canvas p-4">
                <p className="text-xs text-muted">
                  Quiz {detail.data.quiz.number} · Created{" "}
                  {new Intl.DateTimeFormat("en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }).format(new Date(detail.data.quiz.createdAt))}
                </p>
                {challengeId === null && (
                  <div>
                    <h3 className="mb-1 text-xs font-medium">Quiz prompt</h3>
                    <p className="whitespace-pre-wrap leading-6 [overflow-wrap:anywhere]">
                      {detail.data.quiz.prompt ?? detail.data.quiz.topic}
                    </p>
                  </div>
                )}
              </div>
            </details>
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
          className={challengeId === null ? "sm:max-w-lg" : "sm:max-w-sm"}
          showCloseButton={!generation.isPending}
        >
          <DialogTitle>Generate quiz</DialogTitle>
          <DialogDescription className="sr-only">
            {challengeId === null
              ? "Enter a topic or prompt, then choose difficulty and question count."
              : "Choose question count and coverage for a new quiz."}
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!generation.isPending) generation.mutate();
            }}
          >
            {challengeId === null && (
              <div className="space-y-1.5">
                <label htmlFor="quiz-prompt" className="text-xs text-muted">
                  Quiz prompt
                </label>
                <Textarea
                  id="quiz-prompt"
                  aria-describedby="quiz-prompt-help"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-28"
                  placeholder="e.g. JavaScript, or: Test closures and async behavior with short code examples. Focus on common mistakes."
                  required
                  minLength={1}
                  maxLength={4000}
                  disabled={generation.isPending}
                />
                <p id="quiz-prompt-help" className="text-xs text-muted">
                  One word is enough, or describe the concepts and scenarios you
                  want to practice.
                </p>
              </div>
            )}
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
              {challengeId === null ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted">Difficulty</p>
                  <QuizSelect
                    label="Quiz difficulty"
                    value={difficulty}
                    disabled={generation.isPending}
                    onChange={(value) => setDifficulty(value as QuizDifficulty)}
                    options={[
                      { value: "easy", label: "Easy" },
                      { value: "medium", label: "Medium" },
                      { value: "hard", label: "Hard" },
                      { value: "grill", label: "Grill" },
                    ]}
                  />
                </div>
              ) : (
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
              )}
            </div>
            {generation.error && (
              <p role="alert" className="text-xs text-destructive">
                {generation.error.message}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={
                generation.isPending ||
                (challengeId === null && prompt.trim().length === 0)
              }
            >
              {generation.isPending ? "Generating…" : "Generate quiz"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
