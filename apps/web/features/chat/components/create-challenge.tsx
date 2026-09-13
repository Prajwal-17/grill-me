"use client";
import {
  AlertCircle,
  ArrowUp,
  Component as ComponentIcon,
  Flame,
  LoaderCircle,
  Network,
  Target,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import type { BuildDifficulty, BuildScope, Profile } from "@/shared/types/api";
import { ClarificationCard } from "@/shared/components/ai/clarification-card";
import { PromptTextarea } from "@/shared/components/ai/prompt-textarea";
import { PromptSurface } from "@/shared/components/ai/prompt-surface";
import { TypingSuggestion } from "@/shared/components/ai/typing-suggestion";
import {
  EasyDifficultyIcon,
  HardDifficultyIcon,
  MediumDifficultyIcon,
} from "@/shared/components/difficulty-icons";
import { shouldSubmitOnEnter } from "@/features/chat/lib/composer-keyboard";
import { useCreateBuild } from "@/features/chat/hooks/use-create-challenge";
import { BuildOptionMenu } from "@/features/chat/components/build-option-menu";
import { GrillHeat } from "@/features/chat/components/grill-heat";

const EXAMPLES = [
  "Build a React command palette with keyboard navigation",
  "Implement a Go worker pool with graceful shutdown",
  "Add optimistic updates with rollback in TypeScript",
  "Build an idempotent event-processing pipeline with retries",
] as const;

const SUGGESTIONS = [
  "Can you give me a build to practice React?",
  "What can I build to get better at Go?",
  "Can you give me a TypeScript challenge?",
] as const;

const SCOPES = [
  {
    id: "focused",
    label: "Focused",
    description: "One small task.",
    icon: Target,
  },
  {
    id: "feature",
    label: "Feature",
    description: "One complete feature.",
    icon: ComponentIcon,
  },
  {
    id: "system",
    label: "System",
    description: "A working core and system reasoning.",
    icon: Network,
  },
] as const;

const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    description: "Simple logic.",
    icon: EasyDifficultyIcon,
  },
  {
    id: "medium",
    label: "Medium",
    description: "More logic and error handling.",
    icon: MediumDifficultyIcon,
  },
  {
    id: "hard",
    label: "Hard",
    description: "Complex logic and edge cases.",
    icon: HardDifficultyIcon,
  },
  {
    id: "grill",
    label: "Grill",
    description: "Maximum difficulty.",
    icon: Flame,
    accent: "grill",
  },
] as const;

export function GenerationHome({ profile }: { profile: Profile }) {
  const {
    timeBudgetMinutes,
    familiarity,
    emphasis,
    setContext,
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
    ready,
    generate,
    prepare,
    busy,
    error,
    reset,
    submit,
    answer,
    skipClarification,
  } = useCreateBuild(profile);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  function fillExample(example: string) {
    setPrompt(example);
    reset();
    requestAnimationFrame(() =>
      textarea.current?.focus({ preventScroll: true }),
    );
  }

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-[820px] flex-col gap-6 overflow-hidden px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-6 sm:px-8 md:px-10 md:pb-4 md:pt-[min(8vh,80px)]">
      <section
        aria-labelledby="generation-heading"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <h1
          id="generation-heading"
          className="text-balance text-[clamp(2rem,4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.035em]"
        >
          Stop consuming. Start building.
        </h1>
        {!clarification?.question && (
          <div
            className="mt-8 grid gap-x-8 sm:grid-cols-2"
            aria-label="Example builds"
          >
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={busy}
                onClick={() => fillExample(example)}
                className="group border-b border-line py-3 text-left text-sm leading-5 text-muted transition-colors hover:text-foreground focus-visible:border-foreground disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </section>

      <section
        aria-label="Create a build"
        className="mt-auto flex min-h-0 max-h-full shrink-0 flex-col"
      >
        {error && (
          <p
            role="alert"
            id="generation-error"
            className="flex items-start gap-2 text-sm leading-6 mb-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-destructive"
          >
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            {error.message}
          </p>
        )}
        {prepare.error && !generate.error && (
          <Button className="mb-3" disabled={busy} onClick={skipClarification}>
            Create without clarification
          </Button>
        )}
        <PromptSurface
          className="flex min-h-0 flex-col"
          data-grill={difficulty === "grill" || undefined}
          data-working={busy || undefined}
        >
          {difficulty === "grill" && <GrillHeat />}
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
                {!prompt && !focused && (
                  <TypingSuggestion words={SUGGESTIONS} />
                )}
                <PromptTextarea
                  ref={textarea}
                  id="build-request"
                  aria-label="Describe what you want to build"
                  disabled={busy}
                  value={prompt}
                  maxLength={4000}
                  placeholder=""
                  minHeight={112}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "generation-error" : undefined}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
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
              <details className="border-t border-line/70 px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted">
                  Practice context <span className="ml-2">Optional</span>
                </summary>
                <div className="grid gap-3 py-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs">
                    Time available (minutes)
                    <input
                      aria-label="Time available"
                      type="number"
                      min="1"
                      value={timeBudgetMinutes ?? ""}
                      disabled={busy}
                      onChange={(e) => {
                        setContext({
                          timeBudgetMinutes: e.target.value
                            ? Number(e.target.value)
                            : null,
                        });
                        reset();
                      }}
                      className="rounded border border-line bg-surface px-2 py-2 text-sm"
                      placeholder="No time budget"
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    Familiarity with this topic
                    <select
                      aria-label="Topic familiarity"
                      value={familiarity ?? ""}
                      disabled={busy}
                      onChange={(e) => {
                        setContext({
                          familiarity: (e.target.value ||
                            null) as typeof familiarity,
                        });
                        reset();
                      }}
                      className="rounded border border-line bg-surface px-2 py-2 text-sm"
                    >
                      <option value="">Use my preferences</option>
                      <option value="new">Just learned it</option>
                      <option value="practiced">Practiced</option>
                      <option value="comfortable">Comfortable</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs">
                    Emphasis
                    <input
                      aria-label="Practice emphasis"
                      value={emphasis}
                      disabled={busy}
                      onChange={(e) => {
                        setContext({ emphasis: e.target.value });
                        reset();
                      }}
                      className="rounded border border-line bg-surface px-2 py-2 text-sm"
                      placeholder="e.g. debugging"
                    />
                  </label>
                </div>
              </details>
              <div className="flex min-w-0 items-center justify-between gap-1.5 border-t border-line/70 px-2 py-2 sm:gap-2 sm:px-2.5">
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
                <Button
                  type="submit"
                  variant="primary"
                  size="icon"
                  aria-label={
                    prepare.isPending
                      ? "Checking request"
                      : generate.isPending || generate.isSuccess
                        ? "Creating build"
                        : generate.error && ready
                          ? "Try creating build again"
                          : "Create build"
                  }
                  disabled={
                    busy ||
                    Boolean(clarification?.question) ||
                    prompt.trim().length < 3
                  }
                  className="size-9 shrink-0 rounded-full"
                >
                  {busy ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <ArrowUp size={16} />
                  )}
                </Button>
              </div>
            </form>
          )}
        </PromptSurface>
        {prompt.length > 3600 && (
          <p className="mt-2 text-right text-xs text-muted">
            {prompt.length}/4000
          </p>
        )}
      </section>
    </main>
  );
}
