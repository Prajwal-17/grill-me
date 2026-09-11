"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  challengeKeys,
  generateChallenge,
  prepareChallenge,
} from "../../challenges/api/challenge-api";
import { getPreferences, preferencesKey } from "../../profile/api/profile-api";
import type {
  ChallengeFormat,
  ChallengePreparation,
  ClarificationContext,
  Profile,
} from "../../../shared/types/api";
export function useCreateExercise(profile: Profile) {
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

  function skipClarification() {
    if (busy || prompt.trim().length < 3) return;
    setClarification(null);
    setReady(true);
    setLastAnswer(null);
    prepare.reset();
    generate.mutate(null);
  }
  return {
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
  };
}
