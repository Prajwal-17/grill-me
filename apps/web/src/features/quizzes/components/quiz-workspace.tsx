import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
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
  enhanceQuizPrompt,
  deleteQuiz,
  generateQuiz,
  getQuiz,
  getQuizzes,
  quizKeys,
  regenerateQuizTitle,
  restoreQuiz,
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
  displayValue,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  displayValue?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        size="sm"
        className="h-8 w-[150px] max-w-[42vw] border-line bg-surface shadow-none"
      >
        <SelectValue>{displayValue}</SelectValue>
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
  return `${quiz.deletedAt ? "Deleted · " : ""}${quiz.title} · Quiz ${quiz.number} · ${quiz.questionCount} questions${progress}`;
}

function QuizLoadingState({ detail = false }: { detail?: boolean }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <p className="mb-4 inline-flex items-center gap-2 text-sm text-muted">
        <LoaderCircle
          size={15}
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
        {detail ? "Loading quiz…" : "Loading quizzes…"}
      </p>
      {detail ? (
        <div className="animate-pulse space-y-4 motion-reduce:animate-none">
          <div aria-hidden="true" className="flex h-1 gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} className="h-1 flex-1 rounded-full bg-line" />
            ))}
          </div>
          <div className="grid min-w-0 items-start gap-4 @[850px]/quiz:grid-cols-[minmax(0,74ch)_196px] @[850px]/quiz:gap-5">
            <div className="max-w-[74ch] space-y-3" aria-hidden="true">
              <div className="h-6 w-full rounded bg-elevated" />
              <div className="h-6 w-4/5 rounded bg-elevated" />
              <div className="space-y-2 pt-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className="h-[3.75rem] rounded-md bg-elevated"
                  />
                ))}
              </div>
            </div>
            <div
              aria-hidden="true"
              className="space-y-3 border-t border-line pt-3 @[850px]/quiz:border-t-0 @[850px]/quiz:border-l @[850px]/quiz:pt-0 @[850px]/quiz:pl-5"
            >
              <div className="h-4 w-28 rounded bg-elevated" />
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-10 @[850px]/quiz:grid-cols-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="h-11 rounded-md bg-elevated" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-pulse space-y-2 motion-reduce:animate-none">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className="flex min-h-14 items-center gap-3 border-b border-line py-3"
            >
              <span className="size-8 shrink-0 rounded bg-elevated" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block h-4 w-2/5 rounded bg-elevated" />
                <span className="block h-3 w-3/5 rounded bg-elevated" />
              </span>
              <span className="h-4 w-12 rounded bg-elevated" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [allQuizzesOpen, setAllQuizzesOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
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
    queryFn: () => getQuizzes(profileId, challengeId, true),
  });
  const selectedQuizId = allQuizzesOpen
    ? ""
    : (list.data?.find((quiz) => quiz.id === quizId)?.id ??
      (challengeId === null
        ? ""
        : list.data?.find((quiz) => !quiz.deletedAt)?.id) ??
      "");
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
  const selectedSummary = list.data?.find((quiz) => quiz.id === selectedQuizId);

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
      setAllQuizzesOpen(false);
      setAttemptId("");
      setDialogOpen(false);
      void queries.invalidateQueries({ queryKey: listKey });
    },
  });
  const titleGeneration = useMutation({
    mutationFn: (targetQuizId: string) =>
      regenerateQuizTitle(profileId, challengeId, targetQuizId),
    onSuccess: ({ title }, targetQuizId) => {
      queries.setQueryData<QuizDetail>(
        quizKeys.detail(profileId, challengeId, targetQuizId),
        (current) =>
          current ? { ...current, quiz: { ...current.quiz, title } } : current,
      );
      queries.setQueryData<QuizSummary[]>(listKey, (current) =>
        current?.map((quiz) =>
          quiz.id === targetQuizId ? { ...quiz, title } : quiz,
        ),
      );
    },
  });
  const promptEnhancement = useMutation({
    mutationFn: () => enhanceQuizPrompt(profileId, prompt.trim()),
    onSuccess: (result) => {
      setPrompt(result.prompt);
    },
  });
  const start = useMutation({
    mutationFn: () => startQuizAttempt(profileId, challengeId, selectedQuizId),
    onSuccess: (attempt) => {
      updateAttempt(attempt);
      setAttemptId(attempt.id);
    },
  });
  const deletion = useMutation({
    mutationFn: async (targetQuizId: string) => {
      if (targetQuizId === selectedQuizId) await saveRef.current?.();
      return deleteQuiz(profileId, challengeId, targetQuizId);
    },
    onSuccess: async ({ deletedAt }, targetQuizId) => {
      queries.setQueryData<QuizSummary[]>(listKey, (current) =>
        current?.map((quiz) =>
          quiz.id === targetQuizId ? { ...quiz, deletedAt } : quiz,
        ),
      );
      queries.setQueryData<QuizDetail>(
        quizKeys.detail(profileId, challengeId, targetQuizId),
        (current) =>
          current
            ? { ...current, quiz: { ...current.quiz, deletedAt } }
            : current,
      );
      if (quizId === targetQuizId) {
        setQuizId("");
        setAttemptId("");
        setAllQuizzesOpen(true);
      }
      setDeleteTarget(null);
      await queries.invalidateQueries({ queryKey: listKey });
    },
  });
  const restoration = useMutation({
    mutationFn: (targetQuizId: string) =>
      restoreQuiz(profileId, challengeId, targetQuizId),
    onSuccess: async ({ deletedAt }, targetQuizId) => {
      queries.setQueryData<QuizSummary[]>(listKey, (current) =>
        current?.map((quiz) =>
          quiz.id === targetQuizId ? { ...quiz, deletedAt } : quiz,
        ),
      );
      queries.setQueryData<QuizDetail>(
        quizKeys.detail(profileId, challengeId, targetQuizId),
        (current) =>
          current
            ? { ...current, quiz: { ...current.quiz, deletedAt } }
            : current,
      );
      await queries.invalidateQueries({ queryKey: listKey });
    },
  });
  async function select(value: string, kind: "quiz" | "attempt") {
    setChanging(true);
    try {
      await saveRef.current?.();
      if (kind === "quiz") {
        setQuizId(value);
        setAllQuizzesOpen(value === "");
        setAttemptId("");
        start.reset();
        titleGeneration.reset();
        promptEnhancement.reset();
      } else setAttemptId(value);
    } catch {
      /* The toast reports the save error; keep the current attempt visible. */
    } finally {
      setChanging(false);
    }
  }
  const busy =
    changing ||
    generation.isPending ||
    titleGeneration.isPending ||
    promptEnhancement.isPending ||
    start.isPending ||
    deletion.isPending ||
    restoration.isPending;
  const showLibrary =
    !selectedQuizId &&
    list.data !== undefined &&
    !list.isLoading &&
    !list.error;
  const generateButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size={showLibrary ? "default" : "icon-sm"}
          className={showLibrary ? "h-11 md:h-9" : "ml-auto shrink-0"}
          variant={selectedQuizId ? "secondary" : "primary"}
          disabled={busy || list.isLoading}
          aria-label="Generate quiz"
          onClick={() => {
            generation.reset();
            setDialogOpen(true);
          }}
        >
          <Plus size={14} />
          {showLibrary ? (
            "Generate quiz"
          ) : (
            <span className="sr-only">Generate quiz</span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        Generate quiz
      </TooltipContent>
    </Tooltip>
  );

  return (
    <section
      aria-label={
        challengeId === null ? "Standalone quizzes" : "Challenge quizzes"
      }
      className={`mx-auto w-full @container/quiz ${
        showLibrary
          ? "flex h-full min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain"
          : "flex h-full min-h-0 flex-col gap-5 overflow-hidden"
      }`}
    >
      {!showLibrary && !detail.data && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {selectedQuizId && (
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    disabled={busy}
                    aria-label="All quizzes"
                    onClick={() => {
                      void select("", "quiz");
                    }}
                  >
                    <ArrowLeft size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  All quizzes
                </TooltipContent>
              </Tooltip>
              {challengeId !== null && (
                <QuizSelect
                  label="Select quiz"
                  value={selectedQuizId}
                  disabled={busy}
                  onChange={(value) => {
                    void select(value, "quiz");
                  }}
                  options={(list.data ?? [])
                    .filter(
                      (quiz) => !quiz.deletedAt || quiz.id === selectedQuizId,
                    )
                    .map((quiz) => ({
                      value: quiz.id,
                      label: quizLabel(quiz),
                    }))}
                />
              )}
            </div>
          )}
          {generateButton}
        </div>
      )}
      {list.isLoading ? (
        <QuizLoadingState />
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
      ) : showLibrary ? (
        <>
          <QuizTable
            profileId={profileId}
            quizzes={list.data}
            actions={generateButton}
            disabled={busy}
            onDelete={(quiz) => {
              deletion.reset();
              setDeleteTarget(quiz);
            }}
            onRestore={(quiz) => {
              restoration.reset();
              restoration.mutate(quiz.id);
            }}
            onOpen={(id) => {
              void select(id, "quiz");
            }}
          />
          {restoration.error && (
            <p role="alert" className="text-xs text-destructive">
              {restoration.error.message}
            </p>
          )}
        </>
      ) : !selectedQuizId ? (
        <p className="text-sm text-muted">No quizzes yet.</p>
      ) : detail.isLoading ? (
        <QuizLoadingState detail />
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
            {selectedAttempt && (
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2
                  className="min-w-0 break-words text-xl font-semibold tracking-tight [overflow-wrap:anywhere]"
                  title={detail.data.quiz.title}
                >
                  {detail.data.quiz.title}
                </h2>
                {detail.data.quiz.deletedAt && (
                  <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
                    Deleted
                  </span>
                )}
                <span className="text-xs text-muted">
                  Quiz {detail.data.quiz.number} ·{" "}
                  {detail.data.quiz.coverage === "topic"
                    ? detail.data.quiz.difficulty
                    : COVERAGE_LABELS[detail.data.quiz.coverage]}{" "}
                  · {detail.data.quiz.questionCount} questions
                </span>
              </div>
            )}
            <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-3 border-b border-line pb-4">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="-ml-2 shrink-0 px-2 text-muted hover:text-foreground"
                      disabled={busy}
                      aria-label="All quizzes"
                      onClick={() => {
                        void select("", "quiz");
                      }}
                    >
                      <ArrowLeft size={14} />
                      <span>All quizzes</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    All quizzes
                  </TooltipContent>
                </Tooltip>
                {challengeId !== null && (
                  <QuizSelect
                    label="Select quiz"
                    value={selectedQuizId}
                    disabled={busy}
                    onChange={(value) => {
                      void select(value, "quiz");
                    }}
                    options={(list.data ?? [])
                      .filter(
                        (quiz) => !quiz.deletedAt || quiz.id === selectedQuizId,
                      )
                      .map((quiz) => ({
                        value: quiz.id,
                        label: quizLabel(quiz),
                      }))}
                  />
                )}
                {!detail.data.quiz.deletedAt && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0 text-muted"
                        disabled={busy}
                        aria-label={
                          titleGeneration.isPending
                            ? "Regenerating quiz title"
                            : "Regenerate quiz title"
                        }
                        onClick={() => {
                          titleGeneration.reset();
                          titleGeneration.mutate(selectedQuizId);
                        }}
                      >
                        <Sparkles size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      {titleGeneration.isPending
                        ? "Regenerating title…"
                        : "Regenerate quiz title"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="ml-auto flex w-auto max-w-full flex-wrap items-center justify-end gap-1">
                {selectedAttempt && (
                  <QuizSelect
                    label="Select quiz attempt"
                    value={selectedAttempt.id}
                    displayValue={`Attempt ${selectedAttempt.number}`}
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
                {detail.data.quiz.deletedAt ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    aria-label={`Restore quiz ${detail.data.quiz.number}`}
                    onClick={() => {
                      restoration.reset();
                      restoration.mutate(selectedQuizId);
                    }}
                  >
                    <RotateCcw size={14} />
                    Restore
                  </Button>
                ) : (
                  <>
                    {selectedAttempt?.status === "submitted" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            aria-label={
                              start.isPending ? "Starting quiz" : "Retake quiz"
                            }
                            onClick={() => start.mutate()}
                          >
                            <RotateCcw size={14} />
                            {start.isPending ? "Starting…" : "Retake"}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          {start.isPending
                            ? "Starting a new attempt…"
                            : "Start a new attempt"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {selectedSummary && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label={`Delete quiz ${detail.data.quiz.number}`}
                            onClick={() => {
                              deletion.reset();
                              setDeleteTarget(selectedSummary);
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          Move to Deleted
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {generateButton}
                  </>
                )}
              </div>
            </div>
            {titleGeneration.error && (
              <p role="alert" className="text-xs text-destructive">
                {titleGeneration.error.message}
              </p>
            )}
            {start.error && (
              <p role="alert" className="text-xs text-destructive">
                {start.error.message}
              </p>
            )}
            {restoration.error && (
              <p role="alert" className="text-xs text-destructive">
                {restoration.error.message}
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
                readOnly={
                  Boolean(detail.data.quiz.deletedAt) || deletion.isPending
                }
              />
            ) : detail.data.quiz.deletedAt ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain px-4 py-5">
                <section className="w-full max-w-3xl rounded-xl border border-line bg-surface px-5 py-5 sm:px-6 sm:py-6">
                  <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
                    {detail.data.quiz.title}
                  </h2>
                  <p className="mt-3 text-sm text-muted">
                    This quiz is deleted. Restore it to start an attempt.
                  </p>
                </section>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain px-4 py-5">
                <section className="w-full max-w-3xl rounded-xl border border-line bg-surface px-5 py-5 sm:px-6 sm:py-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                    <div className="min-w-0">
                      <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
                        {detail.data.quiz.title}
                      </h2>
                      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
                        <span>Quiz {detail.data.quiz.number}</span>
                        <span aria-hidden="true" className="text-line-strong">
                          ·
                        </span>
                        <span>{detail.data.quiz.questionCount} questions</span>
                        <span aria-hidden="true" className="text-line-strong">
                          ·
                        </span>
                        <span>
                          {detail.data.quiz.coverage === "topic"
                            ? detail.data.quiz.difficulty
                            : COVERAGE_LABELS[detail.data.quiz.coverage]}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="default"
                      variant="primary"
                      className="w-full sm:w-auto"
                      disabled={busy}
                      onClick={() => start.mutate()}
                    >
                      {start.isPending ? (
                        <LoaderCircle
                          size={14}
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <ArrowRight size={14} aria-hidden="true" />
                      )}
                      {start.isPending ? "Starting…" : "Start quiz"}
                    </Button>
                  </div>
                </section>
              </div>
            )}
          </>
        )
      )}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!generation.isPending && !promptEnhancement.isPending)
            setDialogOpen(open);
        }}
      >
        <DialogContent
          className={`max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto p-4 sm:p-5 ${challengeId === null ? "sm:max-w-xl" : "sm:max-w-sm"}`}
          showCloseButton={
            !generation.isPending && !promptEnhancement.isPending
          }
        >
          <DialogTitle className="pr-8">Generate quiz</DialogTitle>
          <DialogDescription className="sr-only">
            {challengeId === null
              ? "Enter a topic or prompt, then choose difficulty and question count."
              : "Choose question count and coverage for a new quiz."}
          </DialogDescription>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!generation.isPending && !promptEnhancement.isPending)
                generation.mutate();
            }}
          >
            {challengeId === null && (
              <div className="space-y-1.5">
                <label
                  htmlFor="quiz-prompt"
                  className="block text-xs font-medium text-muted"
                >
                  Quiz prompt
                </label>
                <div className="relative">
                  <Textarea
                    id="quiz-prompt"
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      promptEnhancement.reset();
                    }}
                    className="min-h-24 max-h-44 overflow-y-auto pr-12 pb-10 leading-6"
                    placeholder="A topic or skill you want to practice…"
                    required
                    minLength={1}
                    maxLength={4000}
                    disabled={
                      generation.isPending || promptEnhancement.isPending
                    }
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="absolute right-2 bottom-2 inline-flex"
                        tabIndex={
                          generation.isPending ||
                          promptEnhancement.isPending ||
                          prompt.trim().length === 0
                            ? 0
                            : undefined
                        }
                      >
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="rounded-md bg-background text-muted hover:bg-elevated hover:text-foreground"
                          disabled={
                            generation.isPending ||
                            promptEnhancement.isPending ||
                            prompt.trim().length === 0
                          }
                          aria-label={
                            promptEnhancement.isPending
                              ? "Enhancing prompt with AI"
                              : "Enhance prompt with AI"
                          }
                          onClick={() => promptEnhancement.mutate()}
                        >
                          {promptEnhancement.isPending ? (
                            <LoaderCircle
                              size={14}
                              aria-hidden="true"
                              className="animate-spin motion-reduce:animate-none"
                            />
                          ) : (
                            <Sparkles size={14} aria-hidden="true" />
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      {promptEnhancement.isPending
                        ? "Enhancing prompt…"
                        : prompt.trim().length === 0
                          ? "Enter a prompt to enable AI enhancement"
                          : generation.isPending
                            ? "Wait for quiz generation to finish"
                            : "Enhance prompt with AI"}
                    </TooltipContent>
                  </Tooltip>
                </div>
                {promptEnhancement.isError && (
                  <p role="alert" className="text-xs text-destructive">
                    {promptEnhancement.error.message} Try again or edit the
                    prompt yourself.
                  </p>
                )}
              </div>
            )}
            {generation.error && (
              <p role="alert" className="text-xs text-destructive">
                {generation.error.message}
              </p>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted">Questions</p>
                  <QuizSelect
                    label="Question count"
                    value={String(questionCount)}
                    disabled={
                      generation.isPending || promptEnhancement.isPending
                    }
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
                    <p className="text-xs font-medium text-muted">Difficulty</p>
                    <QuizSelect
                      label="Quiz difficulty"
                      value={difficulty}
                      disabled={
                        generation.isPending || promptEnhancement.isPending
                      }
                      onChange={(value) =>
                        setDifficulty(value as QuizDifficulty)
                      }
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
                    <p className="text-xs font-medium text-muted">Coverage</p>
                    <QuizSelect
                      label="Quiz coverage"
                      value={coverage}
                      disabled={
                        generation.isPending || promptEnhancement.isPending
                      }
                      onChange={(value) => setCoverage(value as QuizCoverage)}
                      options={Object.entries(COVERAGE_LABELS).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                  </div>
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                className="ml-auto w-full sm:w-auto"
                disabled={
                  generation.isPending ||
                  promptEnhancement.isPending ||
                  (challengeId === null && prompt.trim().length === 0)
                }
              >
                {generation.isPending ? "Generating…" : "Generate quiz"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletion.isPending) {
            setDeleteTarget(null);
            deletion.reset();
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Move quiz to Deleted?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                `Quiz ${deleteTarget.number} will be hidden from the active list. You can find it under Deleted and restore it later. Its number will stay the same.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletion.error && (
            <p role="alert" className="text-xs text-destructive">
              {deletion.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel size="sm" disabled={deletion.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              size="sm"
              variant="destructive"
              disabled={!deleteTarget || deletion.isPending}
              onClick={() => {
                if (deleteTarget) deletion.mutate(deleteTarget.id);
              }}
            >
              {deletion.isPending ? "Moving…" : "Move to Deleted"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
