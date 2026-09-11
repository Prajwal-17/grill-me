"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  challengeKeys,
  generateChallenge,
  prepareChallenge,
} from "../../challenges/api/challenge-api";
import { getPreferences, preferencesKey } from "../../profile/api/profile-api";
import { PersonalContextCard } from "../../profile/components/personal-context-card";
import { Button } from "../../../shared/components/ui/button";
import type {
  ChallengeFormat,
  ChallengePreparation,
  ClarificationContext,
  Profile,
} from "../../../shared/types/api";
import { AnimatePresence } from "motion/react";
import { ClarificationCard } from "../../../shared/components/ai/clarification-card";
import { PromptTextarea } from "../../../shared/components/ai/prompt-textarea";
import { PromptSurface } from "../../../shared/components/ai/prompt-surface";
import { ChoiceSelect } from "../../../shared/components/ui/choice-select";
import { shouldSubmitOnEnter } from "../lib/composer-keyboard";
export function CreateExercise({ profile }: { profile: Profile }) {
  const router = useRouter();
  const queries = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<ChallengeFormat>("auto");
  const [clarification, setClarification] =
    useState<ChallengePreparation | null>(null);
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");
  const [ready, setReady] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<ClarificationContext | null>(
    null,
  );
  const preferences = useQuery({
    queryKey: preferencesKey(profile.id),
    queryFn: () => getPreferences(profile.id),
  });
  const generate = useMutation({
    mutationFn: (context: ClarificationContext | null) =>
      generateChallenge(profile.id, {
        prompt,
        format,
        clarificationContext: context,
      }),
    onSuccess: (created) => {
      queries.setQueryData(
        challengeKeys.detail(profile.id, created.id),
        created,
      );
      void queries.invalidateQueries({
        queryKey: challengeKeys.active(profile.id),
      });
      router.replace("/chat?id=" + created.id);
    },
  });
  const prepare = useMutation({
    mutationFn: () => prepareChallenge(profile.id, prompt, format),
    onSuccess: (result) => {
      if (result.question) setClarification(result);
      else {
        setReady(true);
        generate.mutate(null);
      }
    },
  });
  const busy = prepare.isPending || generate.isPending || generate.isSuccess;
  const error = generate.error ?? prepare.error;
  function reset() {
    setClarification(null);
    setChoice("");
    setCustom("");
    setReady(false);
    setLastAnswer(null);
    prepare.reset();
    generate.reset();
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || prompt.trim().length < 3 || clarification?.question) return;
    if (ready) generate.mutate(lastAnswer);
    else prepare.mutate();
  }
  function answer(value: string) {
    if (!clarification?.question || !value.trim() || busy) return;
    const context = { question: clarification.question, answer: value.trim() };
    setLastAnswer(context);
    setReady(true);
    generate.mutate(context);
  }
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
      <PersonalContextCard
        preferences={preferences.data}
        loading={preferences.isLoading}
        error={preferences.error?.message}
      />
    </main>
  );
}
