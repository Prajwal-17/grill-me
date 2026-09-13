"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, type FormEvent } from "react";
import {
  challengeKeys,
  generateChallenge,
  prepareChallenge,
} from "@/features/challenges/api/challenge-api";
import { useBuildStore } from "@/features/chat/stores/chat-store";
import type { ClarificationContext, Profile } from "@/shared/types/api";

export function useCreateBuild(profile: Profile) {
  const router = useRouter();
  const queries = useQueryClient();
  const {
    prompt,
    timeBudgetMinutes,
    familiarity,
    emphasis,
    setContext,
    scope,
    difficulty,
    clarification,
    choice,
    custom,
    ready,
    lastAnswer,
    setPrompt,
    setScope,
    setDifficulty,
    setClarification,
    setChoice,
    setCustom,
    setReady,
    setLastAnswer,
    resetFlow,
    resetBuild,
  } = useBuildStore();

  useEffect(() => () => resetBuild(), [resetBuild]);

  const generate = useMutation({
    mutationFn: (context: ClarificationContext | null) =>
      generateChallenge(profile.id, {
        prompt,
        timeBudgetMinutes,
        familiarity,
        emphasis: emphasis || null,
        scope,
        difficulty,
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
    mutationFn: () =>
      prepareChallenge(profile.id, {
        prompt,
        scope,
        difficulty,
        timeBudgetMinutes,
        familiarity,
        emphasis: emphasis || null,
      }),
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
    resetFlow();
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
  };
}
