"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppHeader } from "../../../shared/components/app-header";
import { buttonStyles } from "../../../shared/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import {
  challengeKeys,
  getActiveChallenges,
  getChallengeHistory,
} from "../api/challenge-api";
import { formatChallengeType, formatDate } from "../lib/challenge-formatters";

export function ExercisesPage() {
  const profile = useProfile();
  const activeQuery = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const historyQuery = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });

  if (
    profile === undefined ||
    (profile && (activeQuery.isLoading || historyQuery.isLoading))
  ) {
    return <LoadingScreen />;
  }
  if (!profile) return null;

  const error = activeQuery.error ?? historyQuery.error;
  if (error) {
    return (
      <>
        <AppHeader profile={profile} />
        <ErrorState
          title="Could not load exercises."
          message={error.message}
          onRetry={() => {
            activeQuery.refetch();
            historyQuery.refetch();
          }}
        />
      </>
    );
  }

  const active = activeQuery.data ?? [];
  const completed = historyQuery.data ?? [];
  const rowClass =
    "grid min-h-16 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:border-slate-600 hover:bg-elevated";

  return (
    <>
      <AppHeader profile={profile} />
      <main className="mx-auto w-full max-w-5xl px-4 py-9 sm:px-7 sm:py-14">
        <header className="flex flex-col items-start justify-between gap-5 pb-8 sm:flex-row sm:gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-[28px]">
              Exercises
            </h1>
            <p className="mt-1 text-sm text-muted">
              Practice problems generated from what you learn.
            </p>
          </div>
          <Link href="/chat?new=1" className={buttonStyles("primary")}>
            <Plus size={15} /> New exercise
          </Link>
        </header>

        {active.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">In progress</h2>
              <span className="grid size-5 place-items-center rounded bg-elevated text-[10px] text-muted">
                {active.length}
              </span>
            </div>
            <div className="grid gap-2">
              {active.map((challenge) => (
                <Link
                  href={`/chat?id=${challenge.id}`}
                  className={rowClass}
                  key={challenge.id}
                >
                  <span className="grid size-7 place-items-center rounded-md bg-brand">
                    <span className="size-1.5 rounded-full bg-white" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-medium">
                      {challenge.title}
                    </strong>
                    <small className="text-xs text-muted">
                      {formatChallengeType(challenge.type)}
                    </small>
                  </span>
                  <ArrowRight className="text-muted" size={16} />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className={active.length ? "mt-10" : ""}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Completed</h2>
            <span className="grid size-5 place-items-center rounded bg-elevated text-[10px] text-muted">
              {completed.length}
            </span>
          </div>

          {completed.length ? (
            <div className="grid gap-2">
              {completed.map((challenge) => (
                <Link
                  href={`/history?id=${challenge.id}`}
                  className={rowClass}
                  key={challenge.id}
                >
                  <span className="grid size-7 place-items-center rounded-md bg-green-500/15 text-green-300">
                    <Check size={14} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-medium">
                      {challenge.title}
                    </strong>
                    <small className="text-xs text-muted">
                      {formatChallengeType(challenge.type)} ·{" "}
                      {formatDate(challenge.completedAt)}
                    </small>
                  </span>
                  <span className="hidden text-xs text-muted sm:block">
                    {challenge.hint ? "Hint used" : "No hint"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>
              <p>No completed exercises yet.</p>
            </EmptyState>
          )}
        </section>
      </main>
    </>
  );
}
