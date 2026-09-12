"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { Profile } from "@/shared/types/api";
import {
  challengeKeys,
  completeChallenge,
} from "@/features/challenges/api/challenge-api";
import {
  getHint,
  getMessages,
  sendMessage,
} from "@/features/chat/api/message-api";
import type { Submission } from "@/features/chat/types/workspace";
import { useWorkspaceStore } from "@/features/chat/stores/chat-store";
import { useSelectedExercise } from "@/features/chat/hooks/use-selected-exercise";
import { useDiscussionScroll } from "@/features/chat/hooks/use-discussion-scroll";
export function useExerciseWorkspace({
  profile,
  challengeId,
  createNew,
}: {
  profile: Profile | null | undefined;
  challengeId?: string;
  createNew: boolean;
}) {
  const queries = useQueryClient();
  const {
    tab,
    solution,
    solutionFiles,
    question,
    pending,
    reply,
    setTab,
    setSolution,
    setSolutionFiles,
    setQuestion,
    setPending,
    setReply,
    appendReply,
    returnToDraft,
    resetWorkspace,
  } = useWorkspaceStore();
  const solutionComposer = useRef<HTMLTextAreaElement>(null);
  const chatComposer = useRef<HTMLTextAreaElement>(null);
  const activeChallenge = useRef<string | undefined>(undefined);
  const { challenge, loading, error, retry, setCompletedChallenge } =
    useSelectedExercise({ profile, challengeId, createNew });

  useEffect(() => {
    if (challenge?.id && activeChallenge.current !== challenge.id) {
      activeChallenge.current = challenge.id;
      resetWorkspace();
    }
  }, [challenge?.id, resetWorkspace]);

  useEffect(() => () => resetWorkspace(), [resetWorkspace]);

  const messages = useQuery({
    queryKey: challengeKeys.messages(challenge?.id),
    queryFn: () => getMessages(profile!.id, challenge!.id),
    enabled: Boolean(profile && challenge),
  });
  const { scroll, showLatest, onScroll, scrollToLatest, resumeFollowing } =
    useDiscussionScroll([messages.data, reply, pending, tab]);
  const send = useMutation({
    mutationFn: (input: Submission) =>
      sendMessage(
        profile!.id,
        challenge!.id,
        input.content,
        input.mode,
        input.attachments,
        (delta) => appendReply(input.mode, delta),
      ),
    onMutate: (input) => {
      resumeFollowing();
      setPending(input);
      setReply({ content: "", mode: input.mode });
      if (input.mode === "review") setTab("review");
    },
    onSuccess: async (_result, input) => {
      await queries.invalidateQueries({
        queryKey: challengeKeys.messages(challenge!.id),
      });
      if (input.mode === "review") {
        setSolution("");
        setSolutionFiles([]);
      } else setQuestion("");
      setPending(null);
      setReply(null);
    },
    onError: (_error, input) => {
      setPending(null);
      setReply(null);
      if (input.mode === "review") returnToDraft();
    },
  });
  const hint = useMutation({
    mutationFn: () =>
      getHint(profile!.id, challenge!.id, (delta) =>
        appendReply("hint", delta),
      ),
    onMutate: () => {
      setTab("hints");
      setReply({ content: "", mode: "hint" });
    },
    onSuccess: async (updated) => {
      if (updated.status === "completed") setCompletedChallenge(updated);
      queries.setQueryData(
        challengeKeys.detail(profile!.id, challenge!.id),
        updated,
      );
      await Promise.all([
        queries.invalidateQueries({
          queryKey: challengeKeys.active(profile!.id),
        }),
        queries.invalidateQueries({
          queryKey: challengeKeys.messages(challenge!.id),
        }),
      ]);
      setReply(null);
    },
    onError: () => setReply(null),
  });
  const complete = useMutation({
    mutationFn: () => completeChallenge(profile!.id, challenge!.id),
    onSuccess: async (updated) => {
      if (updated.status === "completed") setCompletedChallenge(updated);
      queries.setQueryData(
        challengeKeys.detail(profile!.id, challenge!.id),
        updated,
      );
      await Promise.all([
        queries.invalidateQueries({
          queryKey: challengeKeys.active(profile!.id),
        }),
        queries.invalidateQueries({
          queryKey: challengeKeys.history(profile!.id),
        }),
      ]);
      setTab("reports");
    },
  });
  const busy = send.isPending || hint.isPending || complete.isPending;
  const finished = challenge?.status === "completed";
  const saved = messages.data ?? [];
  const submissions = saved.filter(
    (m) => m.mode === "review" && m.role === "user",
  );
  const reviews = saved.filter(
    (m) => m.mode === "review" && m.role === "assistant",
  );
  const chat = saved.filter((m) => m.mode === "clarify");
  const activityReady = !messages.isLoading && !messages.error;
  return {
    challenge,
    loading,
    error,
    retry,
    tab,
    setTab,
    solution,
    setSolution,
    solutionFiles,
    setSolutionFiles,
    question,
    setQuestion,
    pending,
    reply,
    showLatest,
    onScroll,
    scrollToLatest,
    solutionComposer,
    chatComposer,
    scroll,
    send,
    hint,
    complete,
    messages,
    busy,
    finished,
    saved,
    submissions,
    reviews,
    chat,
    activityReady,
  };
}
export type ExerciseWorkspaceState = ReturnType<typeof useExerciseWorkspace>;
