"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Lightbulb,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  challengeKeys,
  completeChallenge,
  getActiveChallenges,
  getChallenge,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppShell } from "../../../shared/components/app-header";
import { Button } from "../../../shared/components/ui/button";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { cn } from "../../../shared/lib/cn";
import type { MessageAttachment } from "../../../shared/types/api";
import {
  getHint,
  getMessages,
  sendMessage,
  type ComposerMode,
} from "../api/message-api";
import { ChatComposer } from "../components/chat-composer";
import { ChatMessage } from "../components/chat-message";
import { CreateExercise } from "../components/create-exercise";
export function ChatPage({
  challengeId,
  createNew = false,
}: {
  challengeId?: string;
  createNew?: boolean;
}) {
  const profile = useProfile();
  const router = useRouter();
  const queries = useQueryClient();
  const [tab, setTab] = useState<"brief" | "discussion">("brief");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [mode, setMode] = useState<ComposerMode>("clarify");
  const [pending, setPending] = useState<{
    content: string;
    mode: ComposerMode;
    attachments: MessageAttachment[];
  } | null>(null);
  const [reply, setReply] = useState<{
    content: string;
    mode: ComposerMode | "hint";
  } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const active = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile && !challengeId && !createNew),
  });
  const detail = useQuery({
    queryKey: challengeKeys.detail(profile?.id, challengeId),
    queryFn: () => getChallenge(profile!.id, challengeId!),
    enabled: Boolean(profile && challengeId && !createNew),
  });
  const challenge = createNew
    ? undefined
    : challengeId
      ? detail.data
      : active.data?.[0];
  const loading =
    !createNew && (challengeId ? detail.isLoading : active.isLoading);
  const messages = useQuery({
    queryKey: challengeKeys.messages(challenge?.id),
    queryFn: () => getMessages(profile!.id, challenge!.id),
    enabled: Boolean(profile && challenge),
  });
  useEffect(() => {
    if (follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages.data, reply, pending, tab]);
  const send = useMutation({
    mutationFn: () =>
      sendMessage(
        profile!.id,
        challenge!.id,
        message,
        mode,
        attachments,
        (delta) =>
          setReply((current) => ({
            mode,
            content: (current?.content ?? "") + delta,
          })),
      ),
    onMutate: () => {
      follow.current = true;
      setPending({ content: message, mode, attachments });
      setReply({ content: "", mode });
    },
    onSuccess: async () => {
      await queries.invalidateQueries({
        queryKey: challengeKeys.messages(challenge!.id),
      });
      setMessage("");
      setAttachments([]);
      setMode("clarify");
      setPending(null);
      setReply(null);
    },
    onError: () => {
      setPending(null);
      setReply(null);
    },
  });
  const hint = useMutation({
    mutationFn: () =>
      getHint(profile!.id, challenge!.id, (delta) =>
        setReply((current) => ({
          mode: "hint",
          content: (current?.content ?? "") + delta,
        })),
      ),
    onMutate: () => {
      follow.current = true;
      setReply({ content: "", mode: "hint" });
    },
    onSuccess: async (updated) => {
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
      router.push("/history?id=" + updated.id);
    },
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  const error = detail.error ?? active.error;
  const busy = send.isPending || hint.isPending || complete.isPending;
  const finished = challenge?.status === "completed";
  const operationError = send.error ?? hint.error ?? complete.error;
  const visible =
    messages.data?.filter((item) => item.mode !== "generate") ?? [];
  return (
    <AppShell profile={profile}>
      {loading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorState
          title="Could not load this exercise"
          message={error.message}
          onRetry={() => (challengeId ? detail.refetch() : active.refetch())}
        />
      ) : !challenge ? (
        <CreateExercise profile={profile} />
      ) : (
        <main className="flex h-[calc(100dvh-56px)] flex-col md:h-dvh">
          <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-line px-5 md:px-7">
            <Link
              href="/exercises"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
            >
              <ArrowLeft size={15} />
              Exercises
            </Link>
            {finished ? (
              <span className="flex items-center gap-2 text-sm">
                <Check size={15} />
                Completed
              </span>
            ) : (
              <Button
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Mark this exercise complete?"))
                    complete.mutate();
                }}
              >
                {complete.isPending ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                Mark complete
              </Button>
            )}
          </header>
          <div
            className="flex border-b border-line lg:hidden"
            role="tablist"
            aria-label="Exercise view"
          >
            {(["brief", "discussion"] as const).map((value) => (
              <button
                type="button"
                key={value}
                role="tab"
                id={"tab-" + value}
                aria-controls={"panel-" + value}
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                className={cn(
                  "flex-1 border-b-2 py-3 text-sm capitalize",
                  tab === value
                    ? "border-foreground"
                    : "border-transparent text-muted",
                )}
                onClick={() => setTab(value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    const next = value === "brief" ? "discussion" : "brief";
                    setTab(next);
                    document.getElementById("tab-" + next)?.focus();
                  }
                }}
              >
                {value === "brief" ? "Brief" : "Discussion"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(350px,0.9fr)]">
            <section
              id="panel-brief"
              aria-label="Exercise brief"
              className={cn(
                "h-full overflow-y-auto px-5 py-7 lg:block lg:border-r lg:border-line lg:px-8",
                tab !== "brief" && "hidden",
              )}
            >
              <ChallengeCard challenge={challenge} />
            </section>
            <section
              id="panel-discussion"
              aria-label="Discussion"
              className={cn(
                "h-full min-h-0 flex-col bg-surface lg:flex",
                tab === "discussion" ? "flex" : "hidden",
              )}
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold">Discussion</h2>
                {!finished && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      disabled={busy || Boolean(challenge.hint)}
                      onClick={() => hint.mutate()}
                    >
                      <Lightbulb size={15} />
                      {challenge.hint ? "Hint used" : "Get a hint"}
                    </Button>
                    <Button
                      variant={mode === "review" ? "review" : "secondary"}
                      disabled={busy}
                      onClick={() => {
                        setMode("review");
                        composer.current?.focus();
                      }}
                    >
                      <ClipboardCheck size={15} />
                      Review solution
                    </Button>
                  </div>
                )}
              </header>
              <div
                ref={scroll}
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
                onScroll={() => {
                  const node = scroll.current;
                  if (node)
                    follow.current =
                      node.scrollHeight - node.scrollTop - node.clientHeight <
                      100;
                }}
              >
                {messages.isLoading && (
                  <p className="text-sm text-muted">Loading discussion…</p>
                )}
                {messages.error && (
                  <p role="alert" className="text-sm">
                    {messages.error.message}{" "}
                    <button
                      className="underline"
                      onClick={() => void messages.refetch()}
                    >
                      Try again
                    </button>
                  </p>
                )}
                {!messages.isLoading &&
                  !messages.error &&
                  !visible.length &&
                  !pending &&
                  !reply && (
                    <p className="py-12 text-center text-sm text-muted">
                      Ask a question or submit your solution.
                    </p>
                  )}
                {visible.map((item) => (
                  <ChatMessage key={item.id} {...item} />
                ))}
                {pending && <ChatMessage role="user" {...pending} />}
                {reply && <ChatMessage role="assistant" {...reply} streaming />}
              </div>
              {!finished && (
                <ChatComposer
                  mode={mode}
                  message={message}
                  attachments={attachments}
                  busy={busy}
                  error={operationError?.message}
                  textareaRef={composer}
                  onModeChange={setMode}
                  onMessageChange={setMessage}
                  onAttachmentsChange={setAttachments}
                  onSubmit={() => {
                    if (!busy) send.mutate();
                  }}
                />
              )}
            </section>
          </div>
        </main>
      )}
    </AppShell>
  );
}
