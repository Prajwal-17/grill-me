"use client";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  challengeKeys,
  getChallengeHistory,
} from "../../challenges/api/challenge-api";
import { ChallengeCard } from "../../challenges/components/challenge-card";
import {
  formatDate,
  formatChallengeType,
} from "../../challenges/lib/challenge-formatters";
import { getMessages } from "../../chat/api/message-api";
import { ChatMessage } from "../../chat/components/chat-message";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppShell } from "../../../shared/components/app-header";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { cn } from "../../../shared/lib/cn";
export function HistoryPage({ initialId }: { initialId?: string }) {
  const profile = useProfile();
  const [requestedId, setRequestedId] = useState(initialId);
  const history = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  const selectedId = requestedId ?? history.data?.[0]?.id;
  const selected = history.data?.find(
    (challenge) => challenge.id === selectedId,
  );
  const messages = useQuery({
    queryKey: challengeKeys.messages(selected?.id),
    queryFn: () => getMessages(profile!.id, selected!.id),
    enabled: Boolean(profile && selected),
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  return (
    <AppShell profile={profile}>
      {history.isLoading ? (
        <LoadingScreen />
      ) : history.error ? (
        <ErrorState
          title="Could not load history"
          message={history.error.message}
          onRetry={() => history.refetch()}
        />
      ) : (
        <main>
          <header className="border-b border-line px-5 py-7 md:px-8">
            <h1 className="page-title">History</h1>
          </header>
          {!history.data?.length ? (
            <div className="page">
              <p className="text-sm text-muted">No completed exercises yet.</p>
              <Link
                href="/exercises"
                className="mt-4 inline-block text-sm underline underline-offset-4"
              >
                Back to exercises
              </Link>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="border-b border-line p-3 lg:min-h-[calc(100dvh-88px)] lg:border-r lg:border-b-0">
                <label className="field-label lg:hidden">
                  Exercise
                  <select
                    className="field"
                    value={selectedId ?? ""}
                    onChange={(event) => setRequestedId(event.target.value)}
                  >
                    {history.data.map((challenge) => (
                      <option key={challenge.id} value={challenge.id}>
                        {challenge.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="hidden lg:grid lg:gap-1">
                  {history.data.map((challenge) => (
                    <button
                      type="button"
                      key={challenge.id}
                      aria-current={
                        challenge.id === selectedId ? "true" : undefined
                      }
                      className={cn(
                        "rounded-md p-3 text-left hover:bg-elevated",
                        challenge.id === selectedId && "bg-elevated",
                      )}
                      onClick={() => {
                        setRequestedId(challenge.id);
                        window.history.replaceState(
                          null,
                          "",
                          "/history?id=" + challenge.id,
                        );
                      }}
                    >
                      <strong className="block text-sm font-medium">
                        {challenge.title}
                      </strong>
                      <span className="mt-2 block text-xs text-muted">
                        {formatChallengeType(challenge.type)}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {formatDate(challenge.completedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
              {selected ? (
                <section className="mx-auto w-full min-w-0 max-w-[850px] px-5 py-8 md:px-10">
                  <p className="mb-6 flex items-center gap-2 text-xs text-muted">
                    <Check size={14} />
                    Completed {formatDate(selected.completedAt)}
                    {selected.hint ? " · Hint used" : ""}
                  </p>
                  <ChallengeCard challenge={selected} />
                  <section className="mt-10 border-t border-line pt-7">
                    <h2 className="section-heading mb-5">Discussion</h2>
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
                    {messages.data
                      ?.filter((message) => message.mode !== "generate")
                      .map((message) => (
                        <ChatMessage key={message.id} {...message} />
                      ))}
                  </section>
                </section>
              ) : (
                <p className="p-8 text-sm text-muted">
                  Select an exercise from your history.
                </p>
              )}
            </div>
          )}
        </main>
      )}
    </AppShell>
  );
}
