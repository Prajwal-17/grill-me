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
import { Link } from "react-router";
import { ArrowUpRight, BookOpen, ListChecks } from "lucide-react";

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
    clarificationHistory,
    canFallback,
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
    <main className="mx-auto flex h-full min-h-0 w-full max-w-[880px] flex-col gap-7 overflow-y-auto px-5 pb-10 pt-8 sm:px-8 md:px-12 md:pt-16">
      <header className="shrink-0">
        <h2
          id="generation-heading"
          className="text-balance text-[clamp(1.75rem,3vw,2.25rem)] font-semibold leading-[1.12] tracking-[-0.035em]"
        >
          What do you want to practice?
        </h2>
        <p className="mt-3 max-w-[55ch] text-sm leading-6 text-muted">
          Turn a topic into a coding challenge. Build in your editor, then bring
          your implementation back for a review.
        </p>
      </header>

      <section aria-label="Create a build" className="flex shrink-0 flex-col">
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
        {canFallback && !generate.error && (
          <Button className="mb-3" disabled={busy} onClick={skipClarification}>
            Create without clarification
          </Button>
        )}
        {clarificationHistory.length > 0 && (
          <details className="mb-4 text-sm">
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
      <section aria-labelledby="generation-heading" className="shrink-0">
        {!clarification?.question && (
          <div
            className="grid gap-x-6 sm:grid-cols-2"
            aria-label="Example builds"
          >
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={busy}
                onClick={() => fillExample(example)}
                className="group flex items-center justify-between border-b border-line py-3 text-left text-sm leading-5 text-muted transition-colors hover:text-foreground focus-visible:border-foreground disabled:opacity-50"
              >
                <span>{example}</span>
                <ArrowUpRight
                  size={14}
                  className="ml-3 shrink-0"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex shrink-0 flex-wrap gap-5 border-t border-line pt-5 text-sm">
        <Link
          to="/challenges"
          className="inline-flex items-center gap-2 text-muted hover:text-foreground"
        >
          <BookOpen size={16} />
          Continue a challenge
          <ArrowUpRight size={14} />
        </Link>
        <Link
          to="/quizzes"
          className="inline-flex items-center gap-2 text-muted hover:text-foreground"
        >
          <ListChecks size={16} />
          Practice with a quiz
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </main>
  );
}
