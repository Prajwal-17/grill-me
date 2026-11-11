import { QuizDetailSkeleton } from "@/shared/components/ui/loading-layouts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { enqueueGeneration } from "@/features/generations/api/generation-api";
import { useSaveGenerationJob } from "@/features/generations/hooks/use-generation-jobs";
import { useToast } from "@/shared/components/ui/toast";
import { useAppStore } from "@/shared/stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  type LucideIcon,
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
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { ModelPicker } from "@/shared/components/ai/model-picker";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import { useComposerModel } from "@/shared/components/ai/use-composer-model";
import { DIFFICULTIES } from "@/features/chat/components/creation-options";
import { cn } from "@/shared/lib/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
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

const QUESTION_COUNTS = [3, 5, 10, 15] as const;

function QuizSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  displayValue,
  triggerClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  displayValue?: string;
  triggerClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        size="sm"
        className={cn(
          "h-8 w-[150px] max-w-[42vw] border-line bg-surface shadow-none",
          triggerClassName,
        )}
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

type QuizChoice<T extends string> = {
  value: T;
  label: string;
  ariaLabel?: string;
  icon?: LucideIcon;
  accent?: "grill";
};

function QuizChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly QuizChoice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-ui font-medium">{label}</p>
      <div
        role="group"
        aria-label={label}
        className={cn(
          "grid gap-1 rounded-lg border border-line bg-canvas p-1",
          options.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
        )}
      >
        {options.map((option) => {
          const active = option.value === value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              aria-label={option.ariaLabel ?? option.label}
              disabled={disabled}
              data-grill-option={
                active && option.accent === "grill" ? true : undefined
              }
              onClick={() => onChange(option.value)}
              className={cn(
                "pressable inline-flex min-h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-center text-ui leading-tight font-medium text-muted transition-colors hover:bg-elevated/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40",
                active &&
                  "border-line bg-elevated text-foreground shadow-sm hover:bg-elevated hover:text-foreground",
              )}
            >
              {Icon && <Icon size={14} aria-hidden="true" />}
              <span className="min-w-0">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function quizLabel(quiz: QuizSummary) {
  const attempt = quiz.latestAttempt;
  const progress = attempt
    ? attempt.status === "submitted"
      ? ` · ${attempt.score}/${quiz.questionCount}`
      : ` · ${attempt.answered}/${quiz.questionCount} answered`
    : " · Not started";
  return `${quiz.deletedAt ? "Deleted · " : ""}${quiz.title} · #${quiz.number} · ${quiz.questionCount} questions${progress}`;
}

export function QuizWorkspace({
  profileId,
  challengeId = null,
}: {
  profileId: string;
  challengeId?: string | null;
}) {
  const queries = useQueryClient();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const quizId = params.get("quiz") ?? "";
  const setQuizId = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      if (id) next.set("quiz", id);
      else next.delete("quiz");
      void navigate(
        { search: next.toString(), hash: location.hash },
        { replace: true },
      );
    },
    [params, navigate, location.hash],
  );
  const saveJob = useSaveGenerationJob();
  const { show: showToast } = useToast();
  const [attemptId, setAttemptId] = useState("");
  const [allQuizzesOpen, setAllQuizzesOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const composer = useComposerModel();
  const generateRef = useRef<HTMLButtonElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const setupHeadingRef = useRef<HTMLHeadingElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dialogOpen) return;
    const frame = requestAnimationFrame(() => {
      if (challengeId === null) promptInputRef.current?.focus();
      else setupHeadingRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [dialogOpen, challengeId]);
  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
  const [questionCount, setQuestionCount] = useState<QuestionCount>(10);
  const [customQuestionCount, setCustomQuestionCount] = useState(false);
  const customQuestionInputRef = useRef<HTMLInputElement>(null);
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
  const selectedQuizId =
    allQuizzesOpen && !quizId
      ? ""
      : quizId ||
        (challengeId === null
          ? ""
          : list.data?.find((quiz) => !quiz.deletedAt)?.id) ||
        "";
  useEffect(() => {
    if (challengeId !== null && !quizId && !allQuizzesOpen && selectedQuizId)
      setQuizId(selectedQuizId);
  }, [challengeId, quizId, allQuizzesOpen, selectedQuizId, setQuizId]);
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
  const focusedQuiz = useRef("");
  useEffect(() => {
    if (
      quizId &&
      detail.data &&
      !selectedAttempt &&
      startButtonRef.current &&
      focusedQuiz.current !== quizId
    ) {
      focusedQuiz.current = quizId;
      startButtonRef.current.focus();
    }
  }, [quizId, detail.data, selectedAttempt]);
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
          ? {
              questionCount,
              prompt: prompt.trim(),
              difficulty,
              selection: composer.selection,
            }
          : { questionCount, coverage, selection: composer.selection };
      const signature = JSON.stringify(settings);
      const request =
        previous?.settings === signature
          ? previous.request
          : { requestId: crypto.randomUUID(), ...settings };
      requestRef.current = { settings: signature, request };
      return enqueueGeneration(
        profileId,
        challengeId === null
          ? { kind: "quiz", input: request as GenerateStandaloneQuizRequest }
          : {
              kind: "challenge_quiz",
              challengeId,
              input: request as GenerateQuizRequest,
            },
      );
    },
    onSuccess: (job) => {
      saveJob(job);
      requestRef.current = null;
      if (useAppStore.getState().profile?.id !== profileId) return;
      setPrompt("");
      promptEnhancement.reset();
      showToast({
        message: "Quiz queued",
        description: "You can keep working while it generates.",
        scope: `generation:${profileId}`,
      });
      setDialogOpen(false);
      requestAnimationFrame(() => generateRef.current?.focus());
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
    mutationFn: () =>
      enhanceQuizPrompt(profileId, prompt.trim(), composer.selection),
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
  const dialogBusy = generation.isPending || promptEnhancement.isPending;
  function closeDialog() {
    if (dialogBusy) return;
    setDialogOpen(false);
    requestAnimationFrame(() => generateRef.current?.focus());
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
    !(list.isLoading && challengeId !== null && !allQuizzesOpen);
  const showGenerateLabel = showLibrary;
  const generateButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={generateRef}
          size={showGenerateLabel ? "default" : "icon-sm"}
          className={showGenerateLabel ? undefined : "ml-auto shrink-0"}
          variant={selectedQuizId ? "secondary" : "primary"}
          disabled={busy || list.isLoading}
          aria-label="Generate quiz"
          onClick={() => {
            generation.reset();
            promptEnhancement.reset();
            setDialogOpen(true);
          }}
        >
          <Plus size={14} />
          {showGenerateLabel ? (
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

  const workspace = (
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
      <div className="flex min-h-0 flex-1 flex-col gap-4">
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
        {list.error && !list.data ? (
          <div role="alert" className="text-ui text-muted">
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
              quizzes={list.data ?? []}
              loading={list.isLoading}
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
              <p role="alert" className="text-metadata text-destructive">
                {restoration.error.message}
              </p>
            )}
          </>
        ) : !selectedQuizId ? (
          list.isLoading ? (
            <QuizDetailSkeleton />
          ) : (
            <p className="text-ui text-muted">No quizzes yet.</p>
          )
        ) : detail.isLoading ? (
          <QuizDetailSkeleton />
        ) : detail.error ? (
          <div role="alert" className="text-ui text-muted">
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
                    className="min-w-0 break-words text-section font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]"
                    title={detail.data.quiz.title}
                  >
                    {detail.data.quiz.title}
                  </h2>
                  {detail.data.quiz.deletedAt && (
                    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-metadata text-muted">
                      Deleted
                    </span>
                  )}
                  <span className="text-metadata text-muted">
                    #{detail.data.quiz.number} ·{" "}
                    {detail.data.quiz.coverage === "topic"
                      ? detail.data.quiz.difficulty
                      : COVERAGE_LABELS[detail.data.quiz.coverage]}{" "}
                    · {detail.data.quiz.questionCount} questions
                  </span>
                </div>
              )}
              <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-3">
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
                          (quiz) =>
                            !quiz.deletedAt || quiz.id === selectedQuizId,
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
                      aria-label={`Restore quiz #${detail.data.quiz.number}`}
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
                                start.isPending
                                  ? "Starting quiz"
                                  : "Retake quiz"
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
                              aria-label={`Delete quiz #${detail.data.quiz.number}`}
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
                <p role="alert" className="text-metadata text-destructive">
                  {titleGeneration.error.message}
                </p>
              )}
              {start.error && (
                <p role="alert" className="text-metadata text-destructive">
                  {start.error.message}
                </p>
              )}
              {restoration.error && (
                <p role="alert" className="text-metadata text-destructive">
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
                  <section className="w-full max-w-3xl py-5">
                    <h2 className="text-section font-medium tracking-tight sm:text-title">
                      {detail.data.quiz.title}
                    </h2>
                    <p className="mt-3 text-ui text-muted">
                      This quiz is deleted. Restore it to start an attempt.
                    </p>
                  </section>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain px-4 py-5">
                  <section className="w-full max-w-3xl py-5">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                      <div className="min-w-0">
                        <h2 className="text-section font-medium tracking-tight sm:text-title">
                          {detail.data.quiz.title}
                        </h2>
                        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ui text-muted">
                          <span>#{detail.data.quiz.number}</span>
                          <span aria-hidden="true" className="text-line-strong">
                            ·
                          </span>
                          <span>
                            {detail.data.quiz.questionCount} questions
                          </span>
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
                        ref={startButtonRef}
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
      </div>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) setDialogOpen(true);
          else closeDialog();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(88vh,760px)] flex-col gap-0 overflow-hidden rounded-xl bg-popover p-0 sm:max-w-[600px]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <DialogTitle className="text-section font-semibold tracking-[-0.02em]">
                Generate quiz
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-supporting text-muted">
                {challengeId === null ? "Standalone quiz" : "Challenge quiz"}
              </DialogDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="-mr-2 shrink-0"
              disabled={dialogBusy}
              onClick={closeDialog}
            >
              <X size={14} />
              Cancel
            </Button>
          </div>
          <form
            className="flex min-h-0 flex-1 flex-col"
            aria-busy={dialogBusy || undefined}
            onSubmit={(event) => {
              event.preventDefault();
              if (!dialogBusy) generation.mutate();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="space-y-4">
                {challengeId === null ? (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="quiz-prompt"
                      className="block text-ui font-medium"
                    >
                      Quiz prompt
                    </label>
                    <PromptSurface className="focus-within:ring-2 focus-within:ring-ring/20">
                      <PromptTextarea
                        ref={promptInputRef}
                        id="quiz-prompt"
                        value={prompt}
                        onChange={(event) => {
                          setPrompt(event.target.value);
                          promptEnhancement.reset();
                          generation.reset();
                        }}
                        placeholder="A topic or skill you want to practice…"
                        minHeight={120}
                        required
                        maxLength={4000}
                        disabled={dialogBusy}
                        aria-invalid={Boolean(promptEnhancement.error)}
                        aria-describedby={
                          promptEnhancement.error
                            ? "quiz-prompt-error"
                            : undefined
                        }
                      />
                      <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-0.5">
                        <span className="px-2 text-metadata text-muted">
                          {prompt.length > 3600 ? `${prompt.length}/4000` : ""}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={dialogBusy || prompt.trim().length === 0}
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
                            <WandSparkles size={14} aria-hidden="true" />
                          )}
                          {promptEnhancement.isPending
                            ? "Enhancing…"
                            : "Enhance"}
                        </Button>
                      </div>
                    </PromptSurface>
                    {promptEnhancement.error && (
                      <p
                        id="quiz-prompt-error"
                        role="alert"
                        className="text-metadata text-destructive"
                      >
                        {promptEnhancement.error.message} Try again or edit the
                        prompt yourself.
                      </p>
                    )}
                  </div>
                ) : (
                  <h3 ref={setupHeadingRef} tabIndex={-1} className="sr-only">
                    Quiz setup
                  </h3>
                )}
                {generation.error && (
                  <p role="alert" className="text-metadata text-destructive">
                    {generation.error.message}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <div className="space-y-1.5">
                    <p className="text-ui font-medium">Questions</p>
                    <QuizSelect
                      label="Question count"
                      value={
                        customQuestionCount ? "custom" : String(questionCount)
                      }
                      disabled={dialogBusy}
                      triggerClassName="h-10 w-[150px]"
                      onChange={(value) => {
                        if (value === "custom") {
                          setCustomQuestionCount(true);
                          requestAnimationFrame(() =>
                            customQuestionInputRef.current?.focus(),
                          );
                          return;
                        }
                        setCustomQuestionCount(false);
                        setQuestionCount(Number(value));
                      }}
                      options={[
                        ...QUESTION_COUNTS.map((count) => ({
                          value: String(count),
                          label: String(count),
                        })),
                        { value: "custom", label: "Custom" },
                      ]}
                    />
                    {customQuestionCount && (
                      <div className="flex items-center gap-2">
                        <Input
                          ref={customQuestionInputRef}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label="Custom question count"
                          aria-describedby="quiz-custom-count-hint"
                          value={questionCount > 0 ? String(questionCount) : ""}
                          onChange={(event) => {
                            const digits = event.target.value.replace(
                              /\D/g,
                              "",
                            );
                            setQuestionCount(
                              digits ? Math.min(30, Number(digits)) : 0,
                            );
                          }}
                          onBlur={() => {
                            if (questionCount < 1) setQuestionCount(10);
                          }}
                          className="h-8 w-20 bg-surface text-ui"
                        />
                        <span
                          id="quiz-custom-count-hint"
                          className="text-metadata text-muted"
                        >
                          1–30
                        </span>
                      </div>
                    )}
                  </div>
                  {challengeId === null ? (
                    <QuizChoiceGroup
                      label="Difficulty"
                      value={difficulty}
                      disabled={dialogBusy}
                      onChange={(value) =>
                        setDifficulty(value as QuizDifficulty)
                      }
                      options={DIFFICULTIES.map(({ id, ...option }) => ({
                        value: id,
                        ...option,
                      }))}
                    />
                  ) : (
                    <QuizChoiceGroup
                      label="Coverage"
                      value={coverage}
                      disabled={dialogBusy}
                      onChange={(value) => setCoverage(value as QuizCoverage)}
                      options={(
                        Object.keys(COVERAGE_LABELS) as QuizCoverage[]
                      ).map((value) => ({
                        value,
                        label:
                          value === "related"
                            ? "Related"
                            : COVERAGE_LABELS[value],
                        ariaLabel: COVERAGE_LABELS[value],
                      }))}
                    />
                  )}
                </div>
                {composer.connections.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <p className="text-ui font-medium">Model</p>
                    <ModelPicker
                      disabled={dialogBusy}
                      className="min-w-0 flex-wrap sm:ml-auto"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
              <span className="text-metadata text-muted">
                {questionCount > 0
                  ? `${questionCount} questions`
                  : "Set a count"}{" "}
                ·{" "}
                {challengeId === null
                  ? (DIFFICULTIES.find((item) => item.id === difficulty)
                      ?.label ?? difficulty)
                  : COVERAGE_LABELS[coverage]}
              </span>
              <Button
                type="submit"
                variant="primary"
                className="w-full sm:w-auto"
                disabled={
                  dialogBusy ||
                  questionCount < 1 ||
                  (challengeId === null && prompt.trim().length === 0)
                }
              >
                {generation.isPending ? (
                  <LoaderCircle
                    size={14}
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Sparkles size={14} aria-hidden="true" />
                )}
                {generation.isPending ? "Queueing…" : "Generate quiz"}
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
                `Quiz #${deleteTarget.number} will be hidden from the active list. You can find it under Deleted and restore it later. Its number will stay the same.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletion.error && (
            <p role="alert" className="text-metadata text-destructive">
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

  return workspace;
}
