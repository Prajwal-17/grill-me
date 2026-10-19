"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
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
  generateQuiz,
  getQuiz,
  getQuizzes,
  quizKeys,
  regenerateQuizTitle,
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
  return `${quiz.title} · Quiz ${quiz.number} · ${quiz.questionCount} questions${progress}`;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState<QuestionCount>(10);
  const [coverage, setCoverage] = useState<QuizCoverage>("mixed");
  const [prompt, setPrompt] = useState("");
  const [promptEnhanced, setPromptEnhanced] = useState(false);
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
      setPromptEnhanced(true);
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
    start.isPending;
  const showLibrary =
    challengeId === null &&
    !selectedQuizId &&
    list.data !== undefined &&
    !list.isLoading &&
    !list.error;
  const generateButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size={showLibrary ? "default" : "icon-sm"}
          className={showLibrary ? "ml-auto h-11 md:h-9" : "ml-auto shrink-0"}
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
          ? "min-h-full space-y-4 overflow-y-auto overscroll-contain"
          : "flex h-full min-h-0 flex-col gap-2 overflow-hidden"
      }`}
    >
      {!showLibrary && !detail.data && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {challengeId === null && selectedQuizId ? (
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
          ) : null}
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
        <QuizTable
          profileId={profileId}
          quizzes={list.data}
          actions={generateButton}
          disabled={busy}
          onOpen={(id) => {
            void select(id, "quiz");
          }}
        />
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
            <div className="relative flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pb-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {challengeId === null ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
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
                ) : (
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
                )}
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <h2
                    className="min-w-0 truncate text-base font-medium tracking-tight"
                    title={detail.data.quiz.title}
                  >
                    {detail.data.quiz.title}
                  </h2>
                  <span className="hidden shrink-0 text-xs text-muted @[600px]/quiz:inline">
                    {detail.data.quiz.coverage === "topic"
                      ? detail.data.quiz.difficulty
                      : COVERAGE_LABELS[detail.data.quiz.coverage]}{" "}
                    · {detail.data.quiz.questionCount} questions
                  </span>
                </div>
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
              </div>
              <div className="ml-auto flex w-full max-w-full shrink-0 items-center justify-end gap-1 @[500px]/quiz:w-auto">
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
                {generateButton}
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
          if (!generation.isPending && !promptEnhancement.isPending)
            setDialogOpen(open);
        }}
      >
        <DialogContent
          className={challengeId === null ? "sm:max-w-lg" : "sm:max-w-sm"}
          showCloseButton={
            !generation.isPending && !promptEnhancement.isPending
          }
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
              if (!generation.isPending && !promptEnhancement.isPending)
                generation.mutate();
            }}
          >
            {challengeId === null && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="quiz-prompt" className="text-xs text-muted">
                    Quiz prompt
                  </label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex"
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
                          variant="secondary"
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
                          onClick={() => {
                            setPromptEnhanced(false);
                            promptEnhancement.mutate();
                          }}
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
                    <TooltipContent side="bottom" sideOffset={6}>
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
                <Textarea
                  id="quiz-prompt"
                  aria-describedby="quiz-prompt-help"
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setPromptEnhanced(false);
                    promptEnhancement.reset();
                  }}
                  className="min-h-28"
                  placeholder="e.g. JavaScript, or: Test closures and async behavior with short code examples. Focus on common mistakes."
                  required
                  minLength={1}
                  maxLength={4000}
                  disabled={generation.isPending || promptEnhancement.isPending}
                />
                <p id="quiz-prompt-help" className="text-xs text-muted">
                  Start with a topic or rough idea. The enhanced prompt stays
                  editable before you generate the quiz.
                </p>
                {promptEnhancement.isError && (
                  <p role="alert" className="text-xs text-destructive">
                    {promptEnhancement.error.message} Try again or edit the
                    prompt yourself.
                  </p>
                )}
                {promptEnhanced && (
                  <p role="status" className="text-xs text-muted">
                    Prompt enhanced. Review and edit it before generating.
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1.5">
                <p className="text-xs text-muted">Questions</p>
                <QuizSelect
                  label="Question count"
                  value={String(questionCount)}
                  disabled={generation.isPending || promptEnhancement.isPending}
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
                    disabled={
                      generation.isPending || promptEnhancement.isPending
                    }
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
                promptEnhancement.isPending ||
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
