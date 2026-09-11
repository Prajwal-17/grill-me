"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle } from "lucide-react";
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
    <main className="page max-w-[850px]">
      <h1 className="page-title">New exercise</h1>
      <form className="mt-8" onSubmit={submit}>
        <label className="field-label mb-5 max-w-xs">
          Format
          <select
            value={format}
            disabled={busy}
            className="field font-normal"
            onChange={(event) => {
              setFormat(event.target.value as ChallengeFormat);
              reset();
            }}
          >
            <option value="auto">Choose for me</option>
            <option value="exercise">Coding exercise</option>
            <option value="question">Tricky question</option>
            <option value="architecture">Architecture</option>
            <option value="mini-project">Mini-project</option>
          </select>
        </label>
        <label className="field-label">
          What do you want to practice?
          <textarea
            autoFocus
            disabled={busy}
            value={prompt}
            maxLength={4000}
            rows={5}
            placeholder="Python iterators, generators, and when to use each…"
            className="field resize-y py-3 font-normal leading-7"
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
        </label>
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-xs text-muted">{prompt.length}/4000</span>
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy ||
              Boolean(clarification?.question) ||
              prompt.trim().length < 3
            }
          >
            {busy && <LoaderCircle size={16} className="animate-spin" />}
            {prepare.isPending
              ? "Checking request…"
              : generate.isPending || generate.isSuccess
                ? "Creating exercise…"
                : generate.error && ready
                  ? "Try again"
                  : "Create exercise"}
          </Button>
        </div>
      </form>
      {clarification?.question && (
        <form
          className="mt-7 rounded-md border border-line-strong bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            answer(choice === "custom" ? custom : choice);
          }}
        >
          <fieldset disabled={busy}>
            <legend className="mb-4 text-base font-medium">
              {clarification.question}
            </legend>
            <div className="grid gap-2">
              {clarification.options.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-3 rounded border border-line p-3 text-sm has-checked:border-foreground"
                >
                  <input
                    type="radio"
                    name="clarification"
                    value={option}
                    checked={choice === option}
                    onChange={() => setChoice(option)}
                    className="accent-foreground"
                  />
                  {option}
                </label>
              ))}
              <label className="flex items-center gap-3 rounded border border-line p-3 text-sm has-checked:border-foreground">
                <input
                  type="radio"
                  name="clarification"
                  value="custom"
                  checked={choice === "custom"}
                  onChange={() => setChoice("custom")}
                  className="accent-foreground"
                />
                Write an answer
              </label>
            </div>
            {choice === "custom" && (
              <input
                autoFocus
                className="field mt-3"
                aria-label="Your answer"
                value={custom}
                maxLength={2000}
                onChange={(event) => setCustom(event.target.value)}
                placeholder="Your answer"
              />
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => answer("Use your best judgment.")}
              >
                Use your best judgment
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!choice || (choice === "custom" && !custom.trim())}
              >
                {generate.isPending && (
                  <LoaderCircle size={15} className="animate-spin" />
                )}
                Create exercise
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="feedback mt-5">
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
