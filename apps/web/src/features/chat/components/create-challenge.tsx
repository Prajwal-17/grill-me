import { PracticeRowsSkeleton } from "@/shared/components/ui/loading-layouts";
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Component as ComponentIcon,
  LoaderCircle,
  Network,
  Paperclip,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import {
  challengeKeys,
  getActiveChallenges,
  getChallengeHistory,
} from "@/features/challenges/api/challenge-api";
import { formatBuildDifficulty } from "@/features/challenges/lib/challenge-formatters";
import { getQuizzes, quizKeys } from "@/features/quizzes/api/quiz-api";
import { Button } from "@/shared/components/ui/button";
import type {
  BuildDifficulty,
  ChallengeStatus,
  Profile,
} from "@/shared/types/api";
import { ClarificationCard } from "@/shared/components/ai/clarification-card";
import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import { AttachmentChips } from "@/features/chat/components/attachment-chips";
import { ATTACHMENT_ACCEPT } from "@/features/chat/lib/attachment-utils";
import { DIFFICULTIES } from "./creation-options";
import { groupPracticeByDay } from "@/features/chat/lib/practice-groups";
import { shouldSubmitOnEnter } from "@/features/chat/lib/composer-keyboard";
import { useCreateBuild } from "@/features/chat/hooks/use-create-challenge";
import { BuildOptionMenu } from "@/features/chat/components/build-option-menu";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/tabs";
import { QuizComposer } from "@/features/quizzes/components/quiz-composer";
import { BookOpen, ListChecks } from "lucide-react";
import { ModelPicker } from "@/shared/components/ai/model-picker";
const SCOPES = [
  {
    id: "auto",
    label: "Auto",
    icon: Sparkles,
  },
  {
    id: "focused",
    label: "Focused",
    icon: Target,
  },
  {
    id: "feature",
    label: "Feature",
    icon: ComponentIcon,
  },
  {
    id: "system",
    label: "System",
    icon: Network,
  },
] as const;

const PRACTICE_BATCH_SIZE = 15;
const PRACTICE_PREVIEW_LIMIT = PRACTICE_BATCH_SIZE * 3;

const PRACTICE_STATUS = {
  active: { label: "In progress", className: "text-warning" },
  completed: { label: "Completed", className: "text-success" },
  paused: { label: "Paused", className: "text-muted" },
  stopped: { label: "Stopped", className: "text-muted" },
  saved: { label: "Archived", className: "text-muted" },
  new: { label: "Not started", className: "text-muted" },
} satisfies Record<
  ChallengeStatus | "new",
  { label: string; className: string }
>;

export function GenerationHome({ profile }: { profile: Profile }) {
  const [mode, setMode] = useState("challenge");
  const [visibleCount, setVisibleCount] = useState(PRACTICE_BATCH_SIZE);
  const firstAddedRow = useRef<HTMLAnchorElement>(null);
  const reducedMotion = useReducedMotion();
  const active = useQuery({
    queryKey: challengeKeys.active(profile.id),
    queryFn: () => getActiveChallenges(profile.id),
  });
  const history = useQuery({
    queryKey: challengeKeys.history(profile.id),
    queryFn: () => getChallengeHistory(profile.id),
  });
  const quizzes = useQuery({
    queryKey: quizKeys.list(profile.id, null),
    queryFn: () => getQuizzes(profile.id, null, true),
  });
  const items = [
    ...[...(active.data ?? []), ...(history.data ?? [])].map((item) => ({
      id: item.id,
      title: `#${item.number} ${item.title}`,
      date: item.createdAt,
      meta: `Challenge · ${formatBuildDifficulty(item.difficulty)}`,
      status: PRACTICE_STATUS[item.status],
      progress: null,
      href: `/chat?id=${encodeURIComponent(item.id)}`,
      kind: "challenge",
    })),
    ...(quizzes.data ?? [])
      .filter((item) => !item.deletedAt)
      .map((item) => {
        const attempt = item.latestAttempt;
        const status =
          attempt?.status === "submitted"
            ? "completed"
            : attempt
              ? "active"
              : "new";
        return {
          id: item.id,
          title: item.title,
          date: item.createdAt,
          meta: "Quiz",
          status: PRACTICE_STATUS[status],
          progress:
            attempt?.status === "draft"
              ? `${attempt.answered}/${item.questionCount} answered`
              : null,
          href: `/quizzes?quiz=${encodeURIComponent(item.id)}`,
          kind: "quiz",
        };
      }),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const groups = groupPracticeByDay(items.slice(0, visibleCount));
  const firstAddedItem = items[visibleCount - PRACTICE_BATCH_SIZE];
  const canLoadMore =
    visibleCount < PRACTICE_PREVIEW_LIMIT && visibleCount < items.length;
  const loading = active.isLoading || history.isLoading || quizzes.isLoading;
  const error = active.error || history.error || quizzes.error;
  useEffect(() => {
    if (visibleCount > PRACTICE_BATCH_SIZE) firstAddedRow.current?.focus();
  }, [visibleCount]);

  return (
    <main className="h-full min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-8">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mx-auto w-full max-w-[760px] pt-8 pb-7 md:pt-12 md:pb-9">
          <h1 className="mb-4 text-center text-xl font-semibold tracking-tight">
            What would you like to practice?
          </h1>
          <Tabs value={mode} onValueChange={setMode} className="gap-3">
            <TabsContent
              value="challenge"
              forceMount
              hidden={mode !== "challenge"}
            >
              <ChallengeComposer profile={profile} />
            </TabsContent>
            <TabsContent value="quiz" forceMount hidden={mode !== "quiz"}>
              <QuizComposer profileId={profile.id} />
            </TabsContent>
            <TabsList aria-label="Create practice" className="h-9 self-center">
              <TabsTrigger value="challenge" className="px-3">
                <BookOpen size={15} />
                Challenge
              </TabsTrigger>
              <TabsTrigger value="quiz" className="px-3">
                <ListChecks size={15} />
                Quiz
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <section aria-labelledby="recent-practice" className="pb-8">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 id="recent-practice" className="text-ui font-semibold">
              Your practice
            </h2>
            <Link
              className="text-metadata text-muted hover:text-foreground"
              to="/quizzes"
            >
              All quizzes{" "}
              <ArrowRight size={12} className="inline" aria-hidden="true" />
            </Link>
          </div>
          {loading && items.length === 0 && (
            <PracticeRowsSkeleton label="Loading recent practice" dated />
          )}
          {error && (
            <p role="alert" className="py-4 text-ui text-destructive">
              Some practice could not be loaded.{" "}
              <button
                className="underline"
                onClick={() => {
                  void active.refetch();
                  void history.refetch();
                  void quizzes.refetch();
                }}
              >
                Try again
              </button>
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="border-t border-line py-6 text-ui text-muted">
              Your challenges and quizzes will appear here.
            </p>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="sticky top-0 z-10 border-b border-line bg-canvas py-2 text-metadata font-medium text-muted">
                {group.label}
              </h3>
              {group.items.map((item) => (
                <motion.div
                  key={`${item.kind}-${item.id}`}
                  whileTap={reducedMotion ? undefined : { scale: 0.995 }}
                >
                  <Link
                    ref={item === firstAddedItem ? firstAddedRow : undefined}
                    to={item.href}
                    className="group flex scroll-mt-12 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground sm:px-4"
                  >
                    <span
                      className={
                        item.kind === "challenge"
                          ? "grid size-10 shrink-0 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--ember)_35%,var(--line))] bg-[var(--ember-surface)] text-[var(--ember)]"
                          : "grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted"
                      }
                    >
                      {item.kind === "challenge" ? (
                        <BookOpen size={16} />
                      ) : (
                        <ListChecks size={16} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui font-medium">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-metadata text-muted">
                        {item.meta} ·{" "}
                        <span className={item.status.className}>
                          {item.status.label}
                        </span>
                        {item.progress && ` · ${item.progress}`}
                      </span>
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          ))}
          {!loading && (
            <div className="mt-3 flex justify-center border-t border-line pt-4">
              {canLoadMore ? (
                <Button
                  type="button"
                  onClick={() =>
                    setVisibleCount(visibleCount + PRACTICE_BATCH_SIZE)
                  }
                >
                  Load more <ChevronDown size={14} aria-hidden="true" />
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/challenges">
                    View all challenges{" "}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ChallengeComposer({ profile }: { profile: Profile }) {
  const {
    prompt,
    setPrompt,
    scope,
    setScope,
    difficulty,
    setDifficulty,
    clarification,
    choice,
    setChoice,
    custom,
    setCustom,
    clarificationHistory,
    canFallback,
    generate,
    enhance,
    originalPrompt,
    undoEnhancement,
    busy,
    error,
    reset,
    submit,
    answer,
    skipClarification,
    attachments,
    addAttachments,
    setAttachments,
    attachmentError,
  } = useCreateBuild(profile);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (enhance.isSuccess && !busy)
      textarea.current?.focus({ preventScroll: true });
  }, [enhance.isSuccess, busy]);

  return (
    <section aria-label="Create a challenge" className="flex min-w-0 flex-col">
      {error && (
        <p
          role="alert"
          id="generation-error"
          className="flex items-start gap-2 text-ui leading-6 mb-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-destructive"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          {error.message}
        </p>
      )}
      {canFallback && !generate.error && (
        <Button className="mb-3" disabled={busy} onClick={skipClarification}>
          Create without clarification
        </Button>
      )}
      {clarificationHistory.length > 0 && (
        <details className="mb-4 text-ui">
          <summary className="cursor-pointer text-muted">
            Clarification history ({clarificationHistory.length})
          </summary>
          <ol className="mt-3 grid gap-3">
            {clarificationHistory.map((item, index) => (
              <li key={index}>
                <p className="font-medium">{item.question}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted">
                  {item.answer}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <PromptSurface
        className="flex min-h-0 flex-col"
        data-grill={difficulty === "grill" || undefined}
        data-working={busy || undefined}
      >
        {clarification?.question ? (
          <ClarificationCard
            key={clarification.question}
            question={clarification.question}
            options={clarification.options}
            choice={choice}
            custom={custom}
            busy={busy}
            onChoice={setChoice}
            onCustom={setCustom}
            onAnswer={answer}
            onEdit={() => {
              reset();
              requestAnimationFrame(() =>
                textarea.current?.focus({ preventScroll: true }),
              );
            }}
          />
        ) : (
          <form onSubmit={submit}>
            <div className="relative">
              <input
                ref={fileInput}
                type="file"
                multiple
                tabIndex={-1}
                className="hidden"
                accept={ATTACHMENT_ACCEPT}
                aria-hidden="true"
                onChange={(event) => {
                  addAttachments(event.target.files);
                  event.target.value = "";
                }}
              />
              <PromptTextarea
                ref={textarea}
                id="build-request"
                aria-label="Describe what you want to build"
                disabled={busy}
                value={prompt}
                maxLength={4000}
                onAttachFiles={(files) => addAttachments(files)}
                placeholder="Describe a topic or something you want to build… Paste files or images to attach them."
                minHeight={104}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "generation-error" : undefined}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  reset();
                }}
                onKeyDown={(event) => {
                  if (shouldSubmitOnEnter(event)) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
            </div>

            <AttachmentChips
              attachments={attachments}
              disabled={busy}
              onAttachmentsChange={setAttachments}
            />

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-2.5 pb-2.5 pt-1">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label="Attach files"
                  title="Attach files"
                  className="text-foreground/80 hover:bg-elevated hover:text-foreground"
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip size={16} />
                </Button>
                <BuildOptionMenu
                  label="Build scope"
                  value={scope}
                  options={SCOPES}
                  disabled={busy}
                  onChange={(value) => {
                    setScope(value);
                    reset();
                  }}
                />
                <BuildOptionMenu
                  label="Build difficulty"
                  value={difficulty}
                  options={DIFFICULTIES}
                  disabled={busy}
                  onChange={(value: BuildDifficulty) => {
                    setDifficulty(value);
                    reset();
                  }}
                />
                <ModelPicker disabled={busy} />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy || !prompt.trim()}
                  aria-label={
                    enhance.isPending ? "Enhancing prompt" : "Enhance prompt"
                  }
                  title={enhance.isPending ? "Enhancing…" : "Enhance"}
                  onClick={() => enhance.mutate(prompt)}
                  className="text-foreground/80 hover:bg-elevated hover:text-foreground"
                >
                  {enhance.isPending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <WandSparkles size={16} />
                  )}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  aria-label={
                    generate.isPending
                      ? "Queueing challenge"
                      : "Create challenge"
                  }
                  title={
                    generate.isPending
                      ? "Queueing challenge"
                      : "Create challenge"
                  }
                  disabled={
                    busy ||
                    Boolean(clarification?.question) ||
                    prompt.trim().length < 3
                  }
                  className="size-8 shrink-0 rounded-full p-0 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.16)] hover:scale-[1.06]"
                >
                  {busy ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <ArrowUp size={15} />
                  )}
                </Button>
              </div>
            </div>
          </form>
        )}
      </PromptSurface>
      {attachmentError && (
        <p role="alert" className="mt-2 text-metadata text-destructive">
          {attachmentError}
        </p>
      )}
      {originalPrompt !== null && (
        <div className="mt-2 flex items-center gap-2 text-metadata text-muted">
          <span role="status">Prompt enhanced</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              undoEnhancement();
              textarea.current?.focus({ preventScroll: true });
            }}
          >
            Undo
          </Button>
        </div>
      )}
      {prompt.length > 3600 && (
        <p className="mt-2 text-right text-metadata text-muted">
          {prompt.length}/4000
        </p>
      )}
    </section>
  );
}
