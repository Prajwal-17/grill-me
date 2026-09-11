"use client";
import { AlertCircle, ArrowUp, LoaderCircle } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "../../../shared/components/ui/button";
import type {
  BuildDifficulty,
  BuildScope,
  Profile,
} from "../../../shared/types/api";
import { ClarificationCard } from "../../../shared/components/ai/clarification-card";
import { PromptTextarea } from "../../../shared/components/ai/prompt-textarea";
import { PromptSurface } from "../../../shared/components/ai/prompt-surface";
import { TypingSuggestion } from "../../../shared/components/ai/typing-suggestion";
import { shouldSubmitOnEnter } from "../lib/composer-keyboard";
import { useCreateBuild } from "../hooks/use-create-exercise";
import { BuildOptionMenu } from "./build-option-menu";

const EXAMPLES = [
  "Build a React command palette with keyboard navigation",
  "Implement a Go worker pool with graceful shutdown",
  "Add optimistic updates with rollback in TypeScript",
  "Build an idempotent event-processing pipeline with retries",
] as const;

const SUGGESTIONS = [
  "Build a streaming CSV parser that handles malformed rows",
  "Implement a cache with stale-while-revalidate behavior",
  "Add an accessible drag-and-drop list with keyboard controls",
] as const;

const SCOPES = [
  {
    id: "focused",
    label: "Focused",
    description:
      "One clear piece. Best when you’re getting hands-on with something new.",
  },
  {
    id: "feature",
    label: "Feature",
    description: "Several parts working together as one complete feature.",
  },
  {
    id: "system",
    label: "System",
    description: "A larger pipeline or service with real-world constraints.",
  },
] as const;

const DIFFICULTIES = [
  {
    id: "easy",
    label: "Easy",
    description: "Clear requirements and fewer edge cases.",
  },
  {
    id: "medium",
    label: "Medium",
    description: "More moving parts and decisions to make.",
  },
  {
    id: "hard",
    label: "Hard",
    description: "Failures, limits, and trade-offs are part of the build.",
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
    textarea.current?.focus();
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[820px] flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-10 sm:px-8 md:px-10 md:pb-10 md:pt-[12vh]">
      <section aria-labelledby="generation-heading">
        <h1
          id="generation-heading"
          className="text-balance text-[clamp(2rem,4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.035em]"
        >
          Stop consuming. Start building.
        </h1>
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
              className="group border-b border-line py-3 text-left text-sm leading-5 text-muted outline-none transition-colors hover:text-foreground focus-visible:border-foreground disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      <section
        aria-label="Create a build"
        className="mt-auto pt-14 md:pt-[12vh]"
      >
        <AnimatePresence>
          {clarification?.question && (
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
            />
          )}
        </AnimatePresence>
        {error && (
          <p
            role="alert"
            id="generation-error"
            className="feedback mb-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-destructive"
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
        <form onSubmit={submit}>
          <PromptSurface>
            <div className="relative">
              {!prompt && !focused && <TypingSuggestion words={SUGGESTIONS} />}
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
            <div className="flex min-w-0 items-center justify-between gap-2 border-t border-line/70 px-2.5 py-2">
              <div className="flex min-w-0 items-center">
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
          </PromptSurface>
          {prompt.length > 3600 && (
            <p className="mt-2 text-right text-xs text-muted">
              {prompt.length}/4000
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
