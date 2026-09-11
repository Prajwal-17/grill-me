"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  Check,
  ClipboardCheck,
  Lightbulb,
  AlertCircle,
  ChevronDown,
  FileText,
  MessageSquare,
  BarChart3,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  challengeKeys,
  completeChallenge,
  getActiveChallenges,
  getChallenge,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import { formatDate } from "../../challenges/lib/challenge-formatters";
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
import { Markdown } from "../../../shared/components/markdown";
import type { Challenge, MessageAttachment } from "../../../shared/types/api";
import {
  getHint,
  getMessages,
  sendMessage,
  type ComposerMode,
} from "../api/message-api";
import { ChatComposer } from "../components/chat-composer";
import { ChatMessage } from "../components/chat-message";
import { CreateExercise } from "../components/create-exercise";
import { ExerciseReport } from "../components/exercise-report";

type WorkspaceTab = "statement" | "solution" | "review" | "reports" | "chat";
type Submission = {
  content: string;
  mode: ComposerMode;
  attachments: MessageAttachment[];
};
export function ChatPage({
  challengeId,
  createNew = false,
}: {
  challengeId?: string;
  createNew?: boolean;
}) {
  const profile = useProfile();
  const queries = useQueryClient();
  const [tab, setTab] = useState<WorkspaceTab>("statement");
  const [solution, setSolution] = useState("");
  const [solutionFiles, setSolutionFiles] = useState<MessageAttachment[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<Submission | null>(null);
  const [reply, setReply] = useState<{
    content: string;
    mode: ComposerMode | "hint";
  } | null>(null);
  const [completedChallenge, setCompletedChallenge] =
    useState<Challenge | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const solutionComposer = useRef<HTMLTextAreaElement>(null);
  const chatComposer = useRef<HTMLTextAreaElement>(null);
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
      : (completedChallenge ?? active.data?.[0]);
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
    mutationFn: (input: Submission) =>
      sendMessage(
        profile!.id,
        challenge!.id,
        input.content,
        input.mode,
        input.attachments,
        (delta) =>
          setReply((current) => ({
            mode: input.mode,
            content: (current?.content ?? "") + delta,
          })),
      ),
    onMutate: (input) => {
      follow.current = true;
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
      if (input.mode === "review")
        setTab((current) => (current === "review" ? "solution" : current));
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
      setHintOpen(true);
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
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  const error = detail.error ?? active.error;
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
  const messageFeedback = messages.isLoading ? (
    <p role="status" className="text-sm text-muted">
      Loading saved activity…
    </p>
  ) : messages.error ? (
    <p role="alert" className="feedback">
      <AlertCircle size={16} />
      {messages.error.message}
      <button className="underline" onClick={() => void messages.refetch()}>
        Try again
      </button>
    </p>
  ) : null;
  const activityReady = !messages.isLoading && !messages.error;
  return (
    <AppShell profile={profile}>
      {loading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorState
          title="Could not load this exercise"
          message={error.message}
          onRetry={() =>
            void (challengeId ? detail.refetch() : active.refetch())
          }
        />
      ) : !challenge ? (
        <CreateExercise profile={profile} />
      ) : (
        <main className="workspace flex min-h-0 flex-col">
          <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-4 md:px-7">
            <Link
              href="/exercises"
              className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
            >
              <ArrowLeft size={15} />
              <span>Exercises</span>
            </Link>
            <div className="flex items-center gap-2">
              {(!finished || challenge.hint) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setTab("statement");
                    setHintOpen(true);
                    requestAnimationFrame(() =>
                      document
                        .querySelector('[data-state="active"][role="tabpanel"]')
                        ?.scrollTo({ top: 0 }),
                    );
                    if (!challenge.hint) hint.mutate();
                  }}
                >
                  <Lightbulb size={14} />
                  {challenge.hint ? "View hint" : "Get a hint"}
                </Button>
              )}
              {finished ? (
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Check size={14} />
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
                      <AlertDialogTitle>
                        Complete this exercise?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Your statement, submissions, and feedback will be saved
                        in History. You won’t be able to submit more work.
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
            </div>
          </header>
          {(complete.error ||
            (send.error && tab !== "solution" && tab !== "chat")) && (
            <p role="alert" className="feedback border-b border-line px-5 py-3">
              <AlertCircle size={16} />
              {(complete.error ?? send.error)?.message}
              {send.error && (
                <button
                  className="underline"
                  onClick={() =>
                    setTab(
                      send.variables?.mode === "review" ? "solution" : "chat",
                    )
                  }
                >
                  Return to your draft
                </button>
              )}
            </p>
          )}
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as WorkspaceTab)}
            className="min-h-0 flex-1 gap-0"
          >
            <div className="shrink-0 overflow-x-auto border-b border-line px-3 md:px-7">
              <TabsList
                variant="line"
                aria-label="Exercise workspace"
                className="min-h-12 min-w-full justify-start gap-0 md:min-w-0"
              >
                {[
                  { id: "statement", label: "Statement", icon: FileText },
                  { id: "solution", label: "Solution", icon: Upload },
                  { id: "review", label: "Review", icon: ClipboardCheck },
                  { id: "reports", label: "Reports", icon: BarChart3 },
                  { id: "chat", label: "Chat", icon: MessageSquare },
                ].map(({ id, label, icon: Icon }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="min-h-11 flex-none px-3 text-xs sm:px-4 sm:text-sm"
                  >
                    <Icon size={15} className="hidden sm:block" />
                    {label}
                    {id === "review" && reviews.length > 0 && (
                      <span className="ml-1 text-xs text-muted">
                        {reviews.length}
                      </span>
                    )}
                    {id === "review" &&
                      send.isPending &&
                      send.variables?.mode === "review" && (
                        <span
                          className="ml-1 size-1.5 animate-pulse rounded-full bg-current"
                          aria-label="Review in progress"
                        />
                      )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent
              value="statement"
              className="min-h-0 overflow-y-auto px-5 py-8 md:px-10 md:py-10"
            >
              <div className="mx-auto max-w-[76ch]">
                {hintOpen && (
                  <div className="mb-6 rounded-xl border border-line bg-canvas/60 p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-sm font-medium">
                        <Lightbulb size={15} />
                        Hint
                      </h2>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHintOpen(false)}
                      >
                        Hide
                      </Button>
                    </div>
                    {hint.error ? (
                      <p role="alert" className="feedback">
                        <AlertCircle size={16} />
                        {hint.error.message}
                        <button
                          className="underline"
                          onClick={() => hint.mutate()}
                        >
                          Try again
                        </button>
                      </p>
                    ) : challenge.hint ? (
                      <div className="reading">
                        <Markdown>{challenge.hint}</Markdown>
                      </div>
                    ) : reply?.mode === "hint" ? (
                      <ChatMessage role="assistant" {...reply} streaming />
                    ) : null}
                  </div>
                )}
                <ChallengeCard challenge={challenge} className="max-w-none" />
                <section className="mt-8 border-t border-line pt-5">
                  {!finished && (
                    <Button
                      variant="primary"
                      onClick={() => setTab("solution")}
                    >
                      <Upload size={15} />
                      Submit your solution
                    </Button>
                  )}
                </section>
              </div>
            </TabsContent>
            <TabsContent
              forceMount
              value="solution"
              className="min-h-0 overflow-y-auto px-5 py-8 data-[state=inactive]:hidden md:px-10 md:py-10"
            >
              <div className="mx-auto w-full max-w-[76ch]">
                <h1 className="page-title">Your solution</h1>
                <p className="mt-2 text-sm text-muted">{challenge.title}</p>
                {!finished && (
                  <>
                    <p className="mb-5 mt-6 text-sm text-muted">
                      Work in your own tools. Paste your solution or attach
                      files for review.
                    </p>
                    <ChatComposer
                      mode="review"
                      fixedMode
                      large
                      message={solution}
                      attachments={solutionFiles}
                      busy={busy}
                      error={
                        send.variables?.mode === "review"
                          ? send.error?.message
                          : undefined
                      }
                      textareaRef={solutionComposer}
                      onModeChange={() => {}}
                      onMessageChange={(value) => {
                        setSolution(value);
                        if (!busy) send.reset();
                      }}
                      onAttachmentsChange={setSolutionFiles}
                      onSubmit={() => {
                        if (!busy)
                          send.mutate({
                            content: solution,
                            attachments: solutionFiles,
                            mode: "review",
                          });
                      }}
                    />
                  </>
                )}
                <section className="mt-8">
                  <h2 className="section-heading">Submitted work</h2>
                  <div className="mt-4">
                    {messageFeedback}
                    {activityReady && !submissions.length && (
                      <p className="text-sm text-muted">
                        No solutions submitted yet.
                      </p>
                    )}
                    {[...submissions].reverse().map((item, index) => (
                      <details
                        key={item.id}
                        className="border-b border-line py-4"
                      >
                        <summary className="flex items-center justify-between gap-3 text-sm">
                          <span>Submission {submissions.length - index}</span>
                          <span className="ml-auto text-xs text-muted">
                            {formatDate(item.createdAt)}
                          </span>
                          <ChevronDown size={14} />
                        </summary>
                        <ChatMessage {...item} />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setTab("review")}
                        >
                          Read feedback
                        </Button>
                      </details>
                    ))}
                  </div>
                </section>
              </div>
            </TabsContent>
            <TabsContent
              value="review"
              className="min-h-0 overflow-y-auto px-5 py-8 md:px-10 md:py-10"
            >
              <div className="mx-auto w-full max-w-[76ch]">
                <h1 className="page-title">Review</h1>
                <p className="mb-6 mt-2 text-sm text-muted">
                  {challenge.title}
                </p>
                {messageFeedback}
                {reply?.mode === "review" && (
                  <ChatMessage role="assistant" {...reply} streaming />
                )}
                {activityReady &&
                  !reviews.length &&
                  reply?.mode !== "review" && (
                    <div className="py-6">
                      <p className="text-sm text-muted">
                        Submit your solution to get feedback.
                      </p>
                      {!finished && (
                        <Button
                          className="mt-4"
                          onClick={() => setTab("solution")}
                        >
                          <Upload size={15} />
                          Add solution
                        </Button>
                      )}
                    </div>
                  )}
                {[...reviews].reverse().map((item, index) => (
                  <section
                    key={item.id}
                    className="border-b border-line py-4 last:border-b-0"
                  >
                    <p className="flex items-center justify-between text-xs text-muted">
                      <span>Review {reviews.length - index}</span>
                      <time dateTime={item.createdAt}>
                        {formatDate(item.createdAt)}
                      </time>
                    </p>
                    <ChatMessage {...item} />
                  </section>
                ))}
              </div>
            </TabsContent>
            <TabsContent
              value="reports"
              className="min-h-0 overflow-y-auto px-5 py-8 md:px-10 md:py-10"
            >
              {messageFeedback ? (
                <div className="mx-auto max-w-[76ch]">{messageFeedback}</div>
              ) : (
                <ExerciseReport
                  challenge={challenge}
                  messages={saved}
                  onReview={() => setTab("review")}
                />
              )}
            </TabsContent>
            <TabsContent
              forceMount
              value="chat"
              className="relative flex min-h-0 flex-col data-[state=inactive]:hidden"
            >
              <div
                ref={scroll}
                className="min-h-0 flex-1 overflow-y-auto px-5 py-8 md:px-10"
                onScroll={() => {
                  const node = scroll.current;
                  if (node) {
                    follow.current =
                      node.scrollHeight - node.scrollTop - node.clientHeight <
                      100;
                    setShowLatest(!follow.current);
                  }
                }}
              >
                <div className="mx-auto w-full max-w-[76ch]">
                  <h1 className="page-title">Chat</h1>
                  <p className="mb-6 mt-2 text-sm text-muted">
                    Clarify a requirement when you need to.
                  </p>
                  {messageFeedback}
                  {chat.map((item) => (
                    <ChatMessage key={item.id} {...item} />
                  ))}
                  {pending?.mode === "clarify" && (
                    <ChatMessage role="user" {...pending} />
                  )}{" "}
                  {reply?.mode === "clarify" && (
                    <ChatMessage role="assistant" {...reply} streaming />
                  )}
                </div>
              </div>
              {showLatest && (
                <Button
                  size="sm"
                  className="absolute bottom-44 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
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
              {!finished && (
                <div className="mx-auto w-full max-w-[calc(76ch+40px)]">
                  <ChatComposer
                    mode="clarify"
                    fixedMode
                    allowAttachments={false}
                    message={question}
                    attachments={[]}
                    busy={busy}
                    error={
                      send.variables?.mode === "clarify"
                        ? send.error?.message
                        : undefined
                    }
                    textareaRef={chatComposer}
                    onModeChange={() => {}}
                    onMessageChange={(value) => {
                      setQuestion(value);
                      if (!busy) send.reset();
                    }}
                    onAttachmentsChange={() => {}}
                    onSubmit={() => {
                      if (!busy)
                        send.mutate({
                          content: question,
                          mode: "clarify",
                          attachments: [],
                        });
                    }}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>
      )}
    </AppShell>
  );
}
