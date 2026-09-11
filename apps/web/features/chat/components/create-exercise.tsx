"use client";
import { AlertCircle, ArrowUp, LoaderCircle } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { PersonalContextCard } from "../../profile/components/personal-context-card";
import { Button } from "../../../shared/components/ui/button";
import type { ChallengeFormat, Profile } from "../../../shared/types/api";
import { ClarificationCard } from "../../../shared/components/ai/clarification-card";
import { PromptTextarea } from "../../../shared/components/ai/prompt-textarea";
import { PromptSurface } from "../../../shared/components/ai/prompt-surface";
import { ChoiceSelect } from "../../../shared/components/ui/choice-select";
import { shouldSubmitOnEnter } from "../lib/composer-keyboard";
import { useCreateExercise } from "../hooks/use-create-exercise";
export function CreateExercise({ profile }: { profile: Profile }) {
  const {
    prompt,
    setPrompt,
    format,
    setFormat,
    clarification,
    choice,
    setChoice,
    custom,
    setCustom,
    ready,
    preferences,
    generate,
    prepare,
    busy,
    error,
    reset,
    submit,
    answer,
    skipClarification,
  } = useCreateExercise(profile);
  return (
    <main className="page max-w-[800px] md:pt-16">
      <h1 className="page-title">New exercise</h1>
      <form className="mt-8" onSubmit={submit}>
        <label
          htmlFor="exercise-request"
          className="mb-3 block text-sm font-medium"
        >
          What do you want to practice?
        </label>
        <PromptSurface>
          <PromptTextarea
            id="exercise-request"
            autoFocus
            disabled={busy}
            value={prompt}
            maxLength={4000}
            placeholder="Python iterators, generators, and when to use each…"
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
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3 pt-1">
            <ChoiceSelect
              label="Format"
              value={format}
              disabled={busy}
              options={[
                { id: "auto", label: "Choose for me" },
                { id: "exercise", label: "Coding exercise" },
                { id: "question", label: "Tricky question" },
                { id: "architecture", label: "Architecture" },
                { id: "mini-project", label: "Mini-project" },
              ]}
              onChange={(value) => {
                setFormat(value as ChallengeFormat);
                reset();
              }}
              className="w-auto max-w-full border-transparent bg-canvas shadow-none"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={
                busy ||
                Boolean(clarification?.question) ||
                prompt.trim().length < 3
              }
            >
              {busy ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <ArrowUp size={15} />
              )}
              {prepare.isPending
                ? "Checking request…"
                : generate.isPending || generate.isSuccess
                  ? "Creating…"
                  : generate.error && ready
                    ? "Try again"
                    : "Create exercise"}
            </Button>
          </div>
        </PromptSurface>
        {prompt.length > 3600 && (
          <p className="mt-2 text-right text-xs text-muted">
            {prompt.length}/4000
          </p>
        )}
      </form>
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
          className="feedback mt-5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-destructive"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          {error.message}
        </p>
      )}
      {prepare.error && !generate.error && (
        <Button className="mt-3" disabled={busy} onClick={skipClarification}>
          Generate without clarification
        </Button>
      )}
      <PersonalContextCard
        preferences={preferences.data}
        loading={preferences.isLoading}
        error={preferences.error?.message}
      />
    </main>
  );
}
