"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  challengeKeys,
  getChallengeHistory,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import {
  formatChallengeType,
  formatDate,
} from "../../challenges/lib/challenge-formatters";
import { getMessages } from "../../chat/api/message-api";
import { ChatMessage } from "../../chat/components/chat-message";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppHeader } from "../../../shared/components/app-header";
import { buttonStyles } from "../../../shared/components/ui/button";
import {
  ErrorState,
  LoadingIndicator,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { cn } from "../../../shared/lib/cn";

export function HistoryPage() {
  const profile = useProfile();
  const [requestedId, setRequestedId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return new URLSearchParams(window.location.search).get("id") ?? undefined;
  });
  const historyQuery = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  const selected =
    historyQuery.data?.find((challenge) => challenge.id === requestedId) ??
    historyQuery.data?.[0];
  const selectedId = selected?.id;
  const messagesQuery = useQuery({
    queryKey: challengeKeys.messages(selected?.id),
    queryFn: () => getMessages(profile!.id, selected!.id),
    enabled: Boolean(profile && selected),
  });

  if (profile === undefined || historyQuery.isLoading) return <LoadingScreen />;
  if (!profile) return null;

  if (historyQuery.error) {
    return (
      <>
        <AppHeader profile={profile} />
        <ErrorState
          title="Could not load history."
          message={historyQuery.error.message}
          onRetry={() => historyQuery.refetch()}
        />
      </>
    );
  }

  if (!historyQuery.data?.length) {
    return (
      <>
        <AppHeader profile={profile} />
        <main className="page-enter mx-auto w-full max-w-xl px-5 py-[14vh]">
          <section className="surface-panel rounded-2xl p-7 text-center sm:p-10">
            <span className="mx-auto grid size-11 place-items-center rounded-xl border border-brand/20 bg-brand/10 text-brand-bright">
              <CalendarDays size={19} />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
              No completed exercises
            </h1>
            <p className="mt-2 text-sm text-muted">
              Complete an exercise and its challenge, conversation, and review
              will appear here.
            </p>
            <Link href="/chat" className={cn(buttonStyles("primary"), "mt-6")}>
              <ArrowLeft size={16} /> Back to chat
            </Link>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader profile={profile} />
      <main className="page-enter mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-bright">
              Your archive
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-[28px]">
              History
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Revisit completed work, conversations, and submitted solutions.
            </p>
          </div>
          <span className="w-fit rounded-full border border-line-strong bg-surface/70 px-3 py-1.5 text-xs text-muted">
            {historyQuery.data.length} completed
          </span>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="surface-panel overflow-hidden rounded-2xl lg:sticky lg:top-20">
            <div className="border-b border-line px-4 py-3.5">
              <p className="text-xs font-semibold text-foreground">
                Completed exercises
              </p>
              <p className="mt-0.5 text-[11px] text-dim">
                Select one to inspect the full record.
              </p>
            </div>
            <nav
              className="grid max-h-[360px] gap-1.5 overflow-y-auto p-2 sm:grid-cols-2 lg:max-h-[calc(100dvh-11rem)] lg:grid-cols-1"
              aria-label="Completed exercises"
            >
              {historyQuery.data.map((challenge) => (
                <button
                  type="button"
                  key={challenge.id}
                  aria-current={
                    challenge.id === selectedId ? "page" : undefined
                  }
                  className={cn(
                    "group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
                    challenge.id === selectedId
                      ? "border-brand/35 bg-brand-soft/70 shadow-sm shadow-brand/5"
                      : "border-transparent hover:border-line hover:bg-elevated/70",
                  )}
                  onClick={() => {
                    setRequestedId(challenge.id);
                    window.history.replaceState(
                      null,
                      "",
                      `/history?id=${challenge.id}`,
                    );
                  }}
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-medium">
                      {challenge.title}
                    </strong>
                    <span className="mt-1 block text-xs text-muted">
                      {formatChallengeType(challenge.type)}
                    </span>
                    <small className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
                      <CalendarDays size={11} />
                      {formatDate(challenge.completedAt)}
                      {challenge.hint && (
                        <>
                          <span aria-hidden="true">·</span>
                          <Lightbulb size={11} /> hint used
                        </>
                      )}
                    </small>
                  </span>
                  <span className="grid size-6 place-items-center rounded-full bg-green-400/10 text-green-300">
                    <Check size={13} />
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          {selected && (
            <section
              key={selected.id}
              className="surface-panel min-w-0 overflow-hidden rounded-2xl"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/25 px-5 py-4 sm:px-7">
                <span className="inline-flex items-center gap-2 text-xs text-muted">
                  <span className="grid size-6 place-items-center rounded-full bg-green-400/10 text-green-300">
                    <Check size={13} />
                  </span>
                  Completed {formatDate(selected.completedAt)}
                </span>
                {selected.hint && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/5 px-2.5 py-1 text-[11px] text-brand-bright">
                    <Lightbulb size={12} /> Hint used
                  </span>
                )}
              </header>

              <div className="px-5 py-3 sm:px-8 sm:py-5">
                <ChallengeCard challenge={selected} />
              </div>

              <section className="border-t border-line bg-canvas/20 px-5 py-6 sm:px-8 sm:py-8">
                <div className="mb-5 flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg border border-line bg-elevated text-brand-bright">
                    <MessageSquare size={15} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">Conversation</h2>
                    <p className="text-xs text-muted">
                      Questions, hints, and solution feedback
                    </p>
                  </div>
                </div>
                {messagesQuery.isLoading && (
                  <div className="rounded-xl border border-line bg-surface/60 p-4">
                    <LoadingIndicator label="Loading conversation…" />
                  </div>
                )}
                {messagesQuery.error && (
                  <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
                    {messagesQuery.error.message}
                  </p>
                )}
                {!messagesQuery.isLoading &&
                  !messagesQuery.error &&
                  messagesQuery.data?.filter(
                    (message) => message.mode !== "generate",
                  ).length === 0 && (
                    <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-xs text-muted">
                      No conversation was saved for this exercise.
                    </p>
                  )}
                {messagesQuery.data
                  ?.filter((message) => message.mode !== "generate")
                  .map((message) => (
                    <ChatMessage
                      key={message.id}
                      role={message.role}
                      mode={message.mode}
                      content={message.content}
                      attachments={message.attachments}
                    />
                  ))}
              </section>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
