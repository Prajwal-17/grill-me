import {
  AlertCircle,
  ArrowUp,
  Component as ComponentIcon,
  Flame,
  LoaderCircle,
  Network,
  Target,
} from "lucide-react";
import { useRef } from "react";
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

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-[880px] flex-col overflow-y-auto px-5 py-8 sm:px-8 md:px-12">
      <section
        aria-label="Create a build"
        className="my-auto flex shrink-0 flex-col"
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
                <PromptTextarea
                  ref={textarea}
                  id="build-request"
                  aria-label="Describe what you want to build"
                  disabled={busy}
                  value={prompt}
                  maxLength={4000}
                  placeholder="Describe a topic or something you want to build…"
                  minHeight={112}
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
