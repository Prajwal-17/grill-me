"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  challengeKeys,
  getChallengeHistory,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import { formatDate } from "../../challenges/lib/challenge-formatters";
import { getMessages } from "../../chat/api/message-api";
import { ChatMessage } from "../../chat/components/chat-message";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppHeader } from "../../../shared/components/app-header";
import { buttonStyles } from "../../../shared/components/ui/button";
import {
  ErrorState,
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
  const selectedId = requestedId ?? historyQuery.data?.[0]?.id;
  const selected = historyQuery.data?.find(
    (challenge) => challenge.id === selectedId,
  );
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
        <main className="mx-auto w-full max-w-xl px-5 py-[15vh]">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">
            No completed challenges
          </h1>
          <p className="mt-2 text-sm text-muted">
            Completed challenges will appear here.
          </p>
          <Link href="/chat" className={cn(buttonStyles("primary"), "mt-6")}>
            <ArrowLeft size={16} /> Back to chat
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader profile={profile} />
      <main className="min-h-[calc(100dvh-3.5rem)] lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-line px-4 py-6 lg:border-r lg:border-b-0">
          <div className="px-2 pb-5">
            <h1 className="text-xl font-semibold tracking-tight">History</h1>
            <p className="mt-1 text-xs text-muted">
              {historyQuery.data.length} completed
            </p>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {historyQuery.data.map((challenge) => (
              <button
                type="button"
                key={challenge.id}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
                  challenge.id === selectedId
                    ? "border-brand/40 bg-brand-soft"
                    : "border-transparent hover:bg-surface",
                )}
                onClick={() => setRequestedId(challenge.id)}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-xs font-medium">
                    {challenge.title}
                  </strong>
                  <span className="mt-0.5 block text-[10px] text-muted capitalize">
                    {challenge.type}
                  </span>
                  <small className="mt-1 flex items-center gap-1 text-[10px] text-dim">
                    {formatDate(challenge.completedAt)}
                    {challenge.hint && (
                      <>
                        <span>/</span>
                        <Lightbulb size={11} /> hint used
                      </>
                    )}
                  </small>
                </span>
                <Check className="text-green-400" size={16} />
              </button>
            ))}
          </div>
        </aside>

        {selected && (
          <section className="mx-auto w-full max-w-4xl px-5 py-8 md:px-10 md:pb-16">
            <div className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted">
              <Check size={14} /> Completed {formatDate(selected.completedAt)}
            </div>
            <ChallengeCard challenge={selected} />
            <section className="mt-10 border-t border-line pt-7">
              <h2 className="mb-4 text-sm font-semibold">Conversation</h2>
              {messagesQuery.isLoading && (
                <p className="text-xs text-muted">Loading conversation...</p>
              )}
              {messagesQuery.data
                ?.filter((message) => message.mode !== "generate")
                .map((message) => (
                  <ChatMessage
                    key={message.id}
                    role={message.role}
                    mode={message.mode}
                    content={message.content}
                  />
                ))}
            </section>
          </section>
        )}
      </main>
    </>
  );
}
