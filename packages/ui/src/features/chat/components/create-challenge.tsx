import {
  AlertCircle,
  ArrowUp,
  Component as ComponentIcon,
  Flame,
  LoaderCircle,
  Network,
  Target,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { RecentBuilds } from "./recent-builds";
import { Button } from "@/shared/components/ui/button";
import type { BuildDifficulty, BuildScope, Profile } from "@/shared/types/api";
import { ClarificationCard } from "@/shared/components/ai/clarification-card";
import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import {
  EasyDifficultyIcon,
  HardDifficultyIcon,
  MediumDifficultyIcon,
} from "@/shared/components/difficulty-icons";
import { shouldSubmitOnEnter } from "@/features/chat/lib/composer-keyboard";
import { useCreateBuild } from "@/features/chat/hooks/use-create-challenge";
import { BuildOptionMenu } from "@/features/chat/components/build-option-menu";
import { GenerationProgress } from "@/features/generations/components/generation-activity";
const SCOPES = [
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

const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    icon: EasyDifficultyIcon,
  },
  {
    id: "medium",
    label: "Medium",
    icon: MediumDifficultyIcon,
  },
  {
    id: "hard",
    label: "Hard",
    icon: HardDifficultyIcon,
  },
  {
    id: "grill",
    label: "Grill",
    icon: Flame,
    accent: "grill",
  },
] as const;

export function GenerationHome({ profile }: { profile: Profile }) {
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
    generationId,
    enhance,
    originalPrompt,
    undoEnhancement,
    busy,
    error,
    reset,
    submit,
    answer,
    skipClarification,
  } = useCreateBuild(profile);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (enhance.isSuccess && !busy)
      textarea.current?.focus({ preventScroll: true });
  }, [enhance.isSuccess, busy]);

  return (
    <main className="h-full min-h-0 overflow-y-auto overscroll-contain px-5 py-8 sm:px-8 md:py-14">
      <div className="mx-auto w-full max-w-[760px]">
        <section aria-label="Create a build" className="flex shrink-0 flex-col">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-section font-semibold tracking-[-0.02em]">
              New build
            </h2>
            <Link
              to="/quizzes"
              className="text-metadata text-muted hover:text-foreground"
            >
              Create a quiz
            </Link>
          </div>
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
            <Button
              className="mb-3"
              disabled={busy}
              onClick={skipClarification}
            >
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
                  <PromptTextarea
                    ref={textarea}
                    id="build-request"
                    aria-label="Describe what you want to build"
                    disabled={busy}
                    value={prompt}
                    maxLength={4000}
                    placeholder="Describe a topic or something you want to build…"
                    minHeight={156}
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

                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line/70 px-2 py-2 sm:px-2.5">
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <BuildOptionMenu
                      label="Build scope"
                      value={scope}
                      options={SCOPES}
                      disabled={busy}
                      onChange={(value: BuildScope) => {
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
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || !prompt.trim()}
                      aria-label={
                        enhance.isPending
                          ? "Enhancing prompt"
                          : "Enhance prompt"
                      }
                      onClick={() => enhance.mutate(prompt)}
                    >
                      {enhance.isPending ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <WandSparkles size={14} />
                      )}
                      {enhance.isPending ? "Enhancing…" : "Enhance"}
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="icon"
                      aria-label={
                        generate.isPending
                          ? "Queueing challenge"
                          : "Create build"
                      }
                      disabled={
                        busy ||
                        Boolean(clarification?.question) ||
                        prompt.trim().length < 3
                      }
                      className="size-9 shrink-0 rounded-md"
                    >
                      {busy ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <ArrowUp size={16} />
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </PromptSurface>
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
        <div className="mt-4">
          <GenerationProgress
            profileId={profile.id}
            kind="challenge"
            excludeId={generationId}
          />
        </div>
        <RecentBuilds profileId={profile.id} />
      </div>
    </main>
  );
}
