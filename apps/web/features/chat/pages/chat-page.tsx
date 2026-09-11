"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  MessageSquare,
  Check,
  ClipboardCheck,
  Lightbulb,
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../../shared/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../../../shared/components/ui/alert-dialog";
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
  const [showLatest, setShowLatest] = useState(false);
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
        <main className="workspace flex min-h-0 flex-col">
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={busy} size="sm">
                    <Check size={14} />
                    Mark complete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Complete this exercise?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Its brief and discussion will be saved in History. The
                      discussion becomes read-only.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep practicing</AlertDialogCancel>
                    <AlertDialogAction onClick={() => complete.mutate()}>
                      Mark complete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </header>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "brief" | "discussion")}
            className="min-h-0 flex-1 gap-0"
          >
            <TabsList
              variant="line"
              aria-label="Exercise view"
              className="h-12 w-full shrink-0 border-b border-line px-4 lg:hidden"
            >
              <TabsTrigger value="brief">Brief</TabsTrigger>
              <TabsTrigger value="discussion">Discussion</TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(350px,0.9fr)]">
              <TabsContent
                forceMount
                value="brief"
                aria-label="Exercise brief"
                className="m-0 h-full overflow-y-auto px-5 py-7 data-[state=inactive]:hidden lg:block lg:border-r lg:border-line lg:px-9 lg:py-9 lg:data-[state=inactive]:block"
              >
                <ChallengeCard challenge={challenge} />
              </TabsContent>
              <TabsContent
                forceMount
                value="discussion"
                aria-label="Discussion"
                className="m-0 flex h-full min-h-0 flex-col bg-canvas/30 data-[state=inactive]:hidden lg:flex lg:data-[state=inactive]:flex"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <h2 className="text-xs font-medium text-muted">Discussion</h2>
                  {!finished && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || Boolean(challenge.hint)}
                        onClick={() => hint.mutate()}
                      >
                        <Lightbulb size={15} />
                        {challenge.hint ? "Hint used" : "Get a hint"}
                      </Button>
                      <Button
                        size="sm"
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
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div
                    ref={scroll}
                    className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
                    onScroll={() => {
                      const node = scroll.current;
                      if (node) {
                        follow.current =
                          node.scrollHeight -
                            node.scrollTop -
                            node.clientHeight <
                          100;
                        setShowLatest(!follow.current);
                      }
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
                        <div className="py-12">
                          <MessageSquare
                            size={20}
                            strokeWidth={1.5}
                            className="mb-3 text-muted"
                          />
                          <p className="text-sm font-medium">
                            Work through it here
                          </p>
                          <p className="mt-1 max-w-64 text-sm leading-6 text-muted">
                            Ask a question, get a hint, or submit your solution
                            for review.
                          </p>
                        </div>
                      )}
                    {visible.map((item) => (
                      <ChatMessage key={item.id} {...item} />
                    ))}
                    {pending && <ChatMessage role="user" {...pending} />}
                    {reply && (
                      <ChatMessage role="assistant" {...reply} streaming />
                    )}
                  </div>
                  {showLatest && (
                    <Button
                      size="sm"
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
                      onClick={() => {
                        follow.current = true;
                        scroll.current?.scrollTo({
                          top: scroll.current.scrollHeight,
                          behavior: window.matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? "auto"
                            : "smooth",
                        });
                      }}
                    >
                      <ArrowDown size={13} />
                      Latest messages
                    </Button>
                  )}
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
                    onMessageChange={(value) => {
                      setMessage(value);
                      send.reset();
                    }}
                    onAttachmentsChange={setAttachments}
                    onSubmit={() => {
                      if (!busy) send.mutate();
                    }}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>
        </main>
      )}
    </AppShell>
  );
}
