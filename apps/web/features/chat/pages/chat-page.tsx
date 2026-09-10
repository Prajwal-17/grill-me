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
  prepareChallenge,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import { getPreferences, preferencesKey } from "../../profile/api/profile-api";
import { PersonalContextCard } from "../../profile/components/personal-context-card";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppHeader } from "../../../shared/components/app-header";
import { Button, buttonStyles } from "../../../shared/components/ui/button";
import {
  ErrorState,
  LoadingIndicator,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import type {
  ChallengeFormat,
  MessageAttachment,
} from "../../../shared/types/api";
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
  const [format, setFormat] = useState<ChallengeFormat>("auto");
  const [clarificationQuestion, setClarificationQuestion] = useState<
    string | null
  >(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [mode, setMode] = useState<ComposerMode>("clarify");
  const [pendingMessage, setPendingMessage] = useState<{
    content: string;
    mode: ComposerMode;
    attachments: MessageAttachment[];
  } | null>(null);
  const [streamingReply, setStreamingReply] = useState<{
    content: string;
    mode: ComposerMode | "hint";
  } | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const preferencesQuery = useQuery({
    queryKey: preferencesKey(profile?.id),
    queryFn: () => getPreferences(profile!.id),
    enabled: Boolean(profile),
  });

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
    mutationFn: (clarificationContext: string | null) =>
      generateChallenge(profile!.id, {
        prompt,
        format,
        clarificationContext,
      }),
    onSuccess: (created) => {
      queryClient.setQueryData(
        challengeKeys.detail(profile!.id, created.id),
        created,
      );
      void queryClient.invalidateQueries({
        queryKey: challengeKeys.active(profile!.id),
      });
      setPrompt("");
      setClarificationQuestion(null);
      setClarificationAnswer("");
      router.replace(`/chat?id=${created.id}`);
    },
  });

  const prepare = useMutation({
    mutationFn: () => prepareChallenge(profile!.id, prompt, format),
    onSuccess: (result) => {
      if (result.question) {
        setClarificationQuestion(result.question);
        setClarificationAnswer("");
        return;
      }
      generate.mutate(null);
    },
  });

  const send = useMutation({
    mutationFn: () =>
      sendMessage(
        profile!.id,
        challenge!.id,
        message,
        mode,
        attachments,
        (delta) => {
          setStreamingReply((current) => ({
            mode: current?.mode ?? mode,
            content: (current?.content ?? "") + delta,
          }));
        },
      ),
    onMutate: () => {
      setPendingMessage({ content: message, mode, attachments });
      setStreamingReply({ content: "", mode });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: challengeKeys.messages(challenge!.id),
      });
      setMessage("");
      setAttachments([]);
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
      if (prompt.trim() && !prepare.isPending && !generate.isPending) {
        prepare.mutate();
      }
    }

    const generationError = prepare.error ?? generate.error;
    const generationBusy = prepare.isPending || generate.isPending;

    return (
      <>
        <AppHeader profile={profile} />
        <main className="page-enter mx-auto w-full max-w-6xl px-5 py-9 sm:py-12">
          <Link
            href="/exercises"
            className="mb-7 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-brand-bright transition hover:text-foreground"
          >
            <ArrowLeft size={14} /> Exercises
          </Link>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="surface-panel rounded-2xl p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-bright">
                New practice
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                Create an exercise
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                Describe what you want to practice. Your request takes priority;
                saved context personalizes everything else.
              </p>
              <form className="mt-6 grid gap-3" onSubmit={submitGeneration}>
                <label className="grid max-w-xs gap-2 text-sm font-medium">
                  Format
                  <select
                    value={format}
                    disabled={generationBusy}
                    onChange={(event) => {
                      setFormat(event.target.value as ChallengeFormat);
                      setClarificationQuestion(null);
                      setClarificationAnswer("");
                    }}
                    className="h-11 rounded-xl border border-line-strong bg-canvas/70 px-3.5 text-sm font-normal outline-none transition-all duration-200 hover:border-brand/40 focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10"
                  >
                    <option value="auto">Auto</option>
                    <option value="exercise">Coding exercise</option>
                    <option value="question">Tricky question</option>
                    <option value="architecture">Architecture</option>
                    <option value="mini-project">Mini-project</option>
                  </select>
                </label>
                <textarea
                  autoFocus
                  value={prompt}
                  disabled={generationBusy}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setClarificationQuestion(null);
                    setClarificationAnswer("");
                  }}
                  onKeyDown={(event) => {
                    if (!shouldSubmitOnEnter(event)) return;

                    event.preventDefault();
                    if (
                      !generationBusy &&
                      !clarificationQuestion &&
                      prompt.trim().length >= 3
                    ) {
                      prepare.mutate();
                    }
                  }}
                  placeholder="e.g. Python strings, lists, and loops"
                  rows={5}
                  maxLength={4_000}
                  className="min-h-40 resize-y rounded-xl border border-line-strong bg-canvas/70 px-4 py-3.5 text-sm leading-6 outline-none transition-all duration-200 placeholder:text-dim hover:border-brand/40 focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10"
                />
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-[10px] text-dim">
                    {prompt.length}/4000
                  </span>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      generationBusy ||
                      Boolean(clarificationQuestion) ||
                      prompt.trim().length < 3
                    }
                  >
                    {generationBusy && (
                      <LoaderCircle className="animate-spin" size={15} />
                    )}
                    {prepare.isPending
                      ? "Checking request…"
                      : generate.isPending
                        ? "Creating exercise…"
                        : clarificationQuestion
                          ? "Answer below"
                          : "Continue"}
                  </Button>
                </div>
              </form>
              {generationBusy && (
                <div className="mt-5 rounded-xl border border-line bg-canvas/45 px-4 py-4">
                  <LoadingIndicator
                    label={
                      prepare.isPending
                        ? "Checking whether one detail is needed…"
                        : "Creating and reviewing your exercise…"
                    }
                  />
                </div>
              )}
              {clarificationQuestion && !generationBusy && (
                <form
                  className="mt-5 rounded-2xl border border-brand/45 bg-brand-soft/55 p-5 shadow-lg shadow-brand/5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (clarificationAnswer.trim()) {
                      generate.mutate(clarificationAnswer.trim());
                    }
                  }}
                >
                  <span className="text-xs font-semibold tracking-[0.08em] text-brand uppercase">
                    One detail
                  </span>
                  <h2 className="mt-2 text-base font-semibold leading-6">
                    {clarificationQuestion}
                  </h2>
                  <label className="mt-4 grid gap-2 text-sm font-medium">
                    Your answer
                    <input
                      autoFocus
                      value={clarificationAnswer}
                      onChange={(event) =>
                        setClarificationAnswer(event.target.value)
                      }
                      maxLength={2_000}
                      placeholder="Add the missing context"
                      className="h-11 rounded-xl border border-line-strong bg-canvas px-3.5 text-sm font-normal outline-none transition-all duration-200 placeholder:text-dim hover:border-brand/40 focus:border-brand focus:ring-4 focus:ring-brand/10"
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => generate.mutate("Use your best judgment.")}
                    >
                      Use your best judgment
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!clarificationAnswer.trim()}
                    >
                      Create exercise
                    </Button>
                  </div>
                </form>
              )}
              {generationError && (
                <p className="mt-2 text-xs text-red-400" role="alert">
                  {generationError.message} Your request is still here.
                </p>
              )}
            </section>
            <PersonalContextCard
              preferences={preferencesQuery.data}
              loading={preferencesQuery.isLoading}
              error={preferencesQuery.error?.message}
            />
          </div>
        </main>
      </>
    );
  }

  const busy = send.isPending || hint.isPending || complete.isPending;
  const operationError = send.error ?? hint.error ?? complete.error;

  return (
    <>
      <AppHeader profile={profile} />
      <main className="page-enter mx-auto w-full max-w-[1500px] lg:grid lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,0.95fr)_minmax(390px,1.05fr)]">
        <div className="border-b border-line bg-surface/70 px-5 py-5 backdrop-blur-sm lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-7 lg:pb-14">
          <div className="mb-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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

        <section className="flex min-h-[640px] flex-col bg-surface/85 lg:min-h-0">
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
                  attachments={item.attachments}
                />
              ))}
              {pendingMessage && (
                <ChatMessage
                  role="user"
                  mode={pendingMessage.mode}
                  content={pendingMessage.content}
                  attachments={pendingMessage.attachments}
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
            attachments={attachments}
            busy={send.isPending}
            error={operationError?.message}
            textareaRef={composer}
            onModeChange={setMode}
            onMessageChange={setMessage}
            onAttachmentsChange={setAttachments}
            onSubmit={() => send.mutate()}
          />
        </section>
      </main>
    </>
  );
}
