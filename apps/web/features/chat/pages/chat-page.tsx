"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Lightbulb,
  LoaderCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  challengeKeys,
  completeChallenge,
  generateChallenge,
  getActiveChallenges,
  getChallenge,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppHeader } from "../../../shared/components/app-header";
import { Button, buttonStyles } from "../../../shared/components/ui/button";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import {
  getHint,
  getMessages,
  sendMessage,
  type ComposerMode,
} from "../api/message-api";
import { ChatComposer } from "../components/chat-composer";
import { ChatMessage } from "../components/chat-message";
import { shouldSubmitOnEnter } from "../lib/composer-keyboard";

export function ChatPage({
  challengeId,
  createNew = false,
}: {
  challengeId?: string;
  createNew?: boolean;
}) {
  const profile = useProfile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<ComposerMode>("clarify");
  const [pendingMessage, setPendingMessage] = useState<{
    content: string;
    mode: ComposerMode;
  } | null>(null);
  const [streamingReply, setStreamingReply] = useState<{
    content: string;
    mode: ComposerMode | "hint";
  } | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const activeQuery = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile && !challengeId && !createNew),
  });
  const detailQuery = useQuery({
    queryKey: challengeKeys.detail(profile?.id, challengeId),
    queryFn: () => getChallenge(profile!.id, challengeId!),
    enabled: Boolean(profile && challengeId && !createNew),
  });
  const challenge = createNew
    ? undefined
    : challengeId
      ? detailQuery.data
      : activeQuery.data?.[0];
  const challengeLoading =
    !createNew && (challengeId ? detailQuery.isLoading : activeQuery.isLoading);
  const challengeError = detailQuery.error ?? activeQuery.error;

  const messagesQuery = useQuery({
    queryKey: challengeKeys.messages(challenge?.id),
    queryFn: () => getMessages(profile!.id, challenge!.id),
    enabled: Boolean(profile && challenge),
  });
  const visibleMessages =
    messagesQuery.data?.filter((item) => item.mode !== "generate") ?? [];

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({
      behavior: streamingReply ? "auto" : "smooth",
    });
  }, [messagesQuery.data, streamingReply]);

  const generate = useMutation({
    mutationFn: () => generateChallenge(profile!.id, prompt),
    onSuccess: (created) => {
      queryClient.setQueryData(
        challengeKeys.detail(profile!.id, created.id),
        created,
      );
      void queryClient.invalidateQueries({
        queryKey: challengeKeys.active(profile!.id),
      });
      setPrompt("");
      router.replace(`/chat?id=${created.id}`);
    },
  });

  const send = useMutation({
    mutationFn: () =>
      sendMessage(profile!.id, challenge!.id, message, mode, (delta) => {
        setStreamingReply((current) => ({
          mode: current?.mode ?? mode,
          content: (current?.content ?? "") + delta,
        }));
      }),
    onMutate: () => {
      setPendingMessage({ content: message, mode });
      setStreamingReply({ content: "", mode });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: challengeKeys.messages(challenge!.id),
      });
      setMessage("");
      setMode("clarify");
      setPendingMessage(null);
      setStreamingReply(null);
    },
    onError: () => {
      setPendingMessage(null);
      setStreamingReply(null);
    },
  });

  const hint = useMutation({
    mutationFn: () =>
      getHint(profile!.id, challenge!.id, (delta) => {
        setStreamingReply((current) => ({
          mode: "hint",
          content: (current?.content ?? "") + delta,
        }));
      }),
    onMutate: () => setStreamingReply({ content: "", mode: "hint" }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        challengeKeys.detail(profile!.id, challenge!.id),
        updated,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: challengeKeys.active(profile!.id),
        }),
        queryClient.invalidateQueries({
          queryKey: challengeKeys.messages(challenge!.id),
        }),
      ]);
      setStreamingReply(null);
    },
    onError: () => setStreamingReply(null),
  });

  const complete = useMutation({
    mutationFn: () => completeChallenge(profile!.id, challenge!.id),
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        challengeKeys.detail(profile!.id, challenge!.id),
        updated,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: challengeKeys.active(profile!.id),
        }),
        queryClient.invalidateQueries({
          queryKey: challengeKeys.history(profile!.id),
        }),
      ]);
      router.push("/exercises");
    },
  });

  if (profile === undefined || challengeLoading) return <LoadingScreen />;
  if (!profile) return null;

  if (challengeError) {
    return (
      <>
        <AppHeader profile={profile} />
        <ErrorState
          title="Could not load this exercise."
          message={challengeError.message}
          onRetry={() =>
            challengeId ? detailQuery.refetch() : activeQuery.refetch()
          }
        />
      </>
    );
  }

  if (!challenge) {
    function submitGeneration(event: FormEvent) {
      event.preventDefault();
      if (prompt.trim()) generate.mutate();
    }

    return (
      <>
        <AppHeader profile={profile} />
        <main className="mx-auto w-full max-w-3xl px-5 py-[10vh]">
          <Link
            href="/exercises"
            className="mb-8 inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
          >
            <ArrowLeft size={14} /> Exercises
          </Link>
          <section>
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">
              Create an exercise
            </h1>
            <p className="mt-2 text-sm text-muted">What did you learn?</p>
            <form className="mt-6 grid gap-3" onSubmit={submitGeneration}>
              <textarea
                autoFocus
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (!shouldSubmitOnEnter(event)) return;

                  event.preventDefault();
                  if (!generate.isPending && prompt.trim().length >= 3) {
                    generate.mutate();
                  }
                }}
                placeholder="e.g. Python strings, lists, and loops"
                rows={5}
                maxLength={4_000}
                className="min-h-36 resize-y rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-sm leading-6 outline-none transition placeholder:text-dim hover:border-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[10px] text-dim">
                  {prompt.length}/4000
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={generate.isPending || prompt.trim().length < 3}
                >
                  {generate.isPending && (
                    <LoaderCircle className="animate-spin" size={15} />
                  )}
                  {generate.isPending ? "Generating..." : "Generate exercise"}
                </Button>
              </div>
            </form>
            {generate.error && (
              <p className="mt-2 text-xs text-red-400" role="alert">
                {generate.error.message}
              </p>
            )}
          </section>
        </main>
      </>
    );
  }

  const busy = send.isPending || hint.isPending || complete.isPending;
  const operationError = send.error ?? hint.error ?? complete.error;

  return (
    <>
      <AppHeader profile={profile} />
      <main className="mx-auto w-full max-w-[1500px] lg:grid lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,0.95fr)_minmax(390px,1.05fr)]">
        <div className="border-b border-line bg-surface px-5 py-5 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-7 lg:pb-14">
          <div className="mb-9 flex items-center justify-between gap-4">
            <Link
              href="/exercises"
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
            >
              <ArrowLeft size={14} /> Exercises
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/chat?new=1" className={buttonStyles("secondary")}>
                <Plus size={15} /> New exercise
              </Link>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Mark this exercise complete?")) {
                    complete.mutate();
                  }
                }}
              >
                {complete.isPending ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                Mark complete
              </Button>
            </div>
          </div>
          <ChallengeCard challenge={challenge} />
        </div>

        <section className="flex min-h-[640px] flex-col bg-surface lg:min-h-0">
          <header className="flex flex-col items-start justify-between gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center lg:min-h-[78px] lg:px-6">
            <div>
              <h2 className="text-sm font-semibold">Chat</h2>
              <p className="mt-0.5 text-xs text-muted">
                Ask about the exercise or review your solution.
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                variant="hint"
                className="flex-1 sm:flex-none"
                disabled={busy || Boolean(challenge.hint)}
                onClick={() => hint.mutate()}
              >
                {hint.isPending ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : (
                  <Lightbulb size={15} />
                )}
                {challenge.hint ? "Hint used" : "Get a hint"}
              </Button>
              <Button
                variant={mode === "review" ? "review" : "secondary"}
                className="flex-1 sm:flex-none"
                disabled={busy}
                onClick={() => {
                  setMode("review");
                  window.setTimeout(() => composer.current?.focus(), 0);
                }}
              >
                <ClipboardCheck size={15} /> Review solution
              </Button>
            </div>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6"
            aria-live="polite"
          >
            <div className="mx-auto min-h-full w-full max-w-3xl">
              {messagesQuery.isLoading && (
                <div className="flex min-h-40 items-center justify-center gap-2 text-xs text-muted">
                  <LoaderCircle className="animate-spin" size={18} /> Loading
                  conversation...
                </div>
              )}
              {!messagesQuery.isLoading &&
                visibleMessages.length === 0 &&
                !pendingMessage &&
                !streamingReply && (
                  <div className="flex min-h-56 flex-col items-center justify-center text-center text-xs text-muted">
                    <strong className="text-sm font-medium text-slate-300">
                      No messages yet
                    </strong>
                    <span className="mt-1">
                      Ask a question when you need clarification.
                    </span>
                  </div>
                )}

              {visibleMessages.map((item) => (
                <ChatMessage
                  key={item.id}
                  role={item.role}
                  mode={item.mode}
                  content={item.content}
                />
              ))}
              {pendingMessage && (
                <ChatMessage
                  role="user"
                  mode={pendingMessage.mode}
                  content={pendingMessage.content}
                />
              )}
              {streamingReply && (
                <ChatMessage
                  role="assistant"
                  mode={streamingReply.mode}
                  content={streamingReply.content}
                  streaming
                />
              )}
              <div ref={messagesEnd} />
            </div>
          </div>

          <ChatComposer
            mode={mode}
            message={message}
            busy={send.isPending}
            error={operationError?.message}
            textareaRef={composer}
            onModeChange={setMode}
            onMessageChange={setMessage}
            onSubmit={() => send.mutate()}
          />
        </section>
      </main>
    </>
  );
}
