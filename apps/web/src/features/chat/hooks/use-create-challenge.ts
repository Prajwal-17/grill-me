import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  challengeKeys,
  generateChallenge,
  prepareChallenge,
  enhanceBuildPrompt,
} from "@/features/challenges/api/challenge-api";
import { ApiClientError } from "@/shared/lib/api-client";
import { useBuildStore } from "@/features/chat/stores/chat-store";
import type {
  ChallengePreparation,
  ClarificationContext,
  Profile,
} from "@/shared/types/api";

function clarificationFromError(error: unknown): ChallengePreparation | null {
  if (
    !(error instanceof ApiClientError) ||
    error.code !== "CHALLENGE_NEEDS_CLARIFICATION"
  )
    return null;
  const details = error.details;
  if (
    typeof details?.question !== "string" ||
    !details.question.trim() ||
    !Array.isArray(details.options) ||
    ![0, 2, 3].includes(details.options.length) ||
    !details.options.every(
      (option) => typeof option === "string" && option.trim(),
    )
  )
    return null;
  return { question: details.question, options: details.options };
}

export function useCreateBuild(profile: Profile) {
  const navigate = useNavigate();
  const queries = useQueryClient();
  const {
    prompt,
    scope,
    difficulty,
    clarification,
    choice,
    custom,
    ready,
    lastAnswer,
    clarificationHistory,
    setClarificationHistory,
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

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resetBuild();
    };
  }, [resetBuild]);
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: (history: ClarificationContext[]) =>
      generateChallenge(profile.id, {
        prompt,
        scope,
        difficulty,
        clarificationContext: history.at(-1) ?? null,
        clarificationHistory: history,
      }),
    onError: (error) => {
      const clarification = clarificationFromError(error);
      if (clarification) {
        setClarification(clarification);
        setChoice("");
        setCustom("");
      }
    },
    onSuccess: (created) => {
      queries.setQueryData(
        challengeKeys.detail(profile.id, created.id),
        created,
      );
      void queries.invalidateQueries({
        queryKey: challengeKeys.active(profile.id),
      });
      navigate("/chat?id=" + created.id, { replace: true });
    },
  });
  const prepare = useMutation({
    mutationFn: () =>
      prepareChallenge(profile.id, {
        prompt,
        scope,
        difficulty,
      }),
    onSuccess: (result) => {
      if (result.question) setClarification(result);
      else {
        setReady(true);
        generate.mutate([]);
      }
    },
  });
  const enhance = useMutation({
    mutationFn: (original: string) => enhanceBuildPrompt(profile.id, original),
    onSuccess: (result, original) => {
      if (!mounted.current || useBuildStore.getState().prompt !== original)
        return;
      resetFlow();
      prepare.reset();
      generate.reset();
      setOriginalPrompt(original);
      setPrompt(result.prompt);
    },
  });
  const busy =
    prepare.isPending ||
    generate.isPending ||
    generate.isSuccess ||
    enhance.isPending;
  const clarificationError = clarificationFromError(generate.error);
  const error =
    enhance.error ??
    (clarificationError ? null : (generate.error ?? prepare.error));
  const canFallback =
    prepare.error instanceof TypeError ||
    (prepare.error instanceof ApiClientError &&
      prepare.error.code === "MODEL_UNAVAILABLE");
  function reset() {
    resetFlow();
    prepare.reset();
    generate.reset();
    enhance.reset();
    setOriginalPrompt(null);
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || prompt.trim().length < 3 || clarification?.question) return;
    if (ready)
      generate.mutate(
        clarificationHistory.length
          ? clarificationHistory
          : lastAnswer
            ? [lastAnswer]
            : [],
      );
    else prepare.mutate();
  }
  function answer(value: string) {
    if (!clarification?.question || !value.trim() || busy) return;
    const context = { question: clarification.question, answer: value.trim() };
    const history = [...clarificationHistory, context];
    setLastAnswer(context);
    setClarificationHistory(history);
    setClarification(null);
    setReady(true);
    prepare.reset();
    generate.mutate(history);
  }

  function skipClarification() {
    if (
      busy ||
      !canFallback ||
      clarification?.question ||
      prompt.trim().length < 3
    )
      return;
    setClarification(null);
    setReady(true);
    setLastAnswer(null);
    prepare.reset();
    generate.mutate([]);
  }
  return {
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
    enhance,
    originalPrompt,
    undoEnhancement: () => {
      if (originalPrompt === null || busy) return;
      setPrompt(originalPrompt);
      reset();
    },
    busy,
    error,
    reset,
    submit,
    answer,
    skipClarification,
  };
}
