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
    "group grid min-h-[4.5rem] grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-line bg-surface/75 px-3.5 py-3 shadow-sm shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/35 hover:bg-elevated hover:shadow-lg hover:shadow-black/15";

  return (
    <>
      <AppHeader profile={profile} />
      <main className="page-enter mx-auto w-full max-w-5xl px-4 py-9 sm:px-7 sm:py-14">
        <header className="flex flex-col items-start justify-between gap-5 pb-8 sm:flex-row sm:gap-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-bright">
              Practice space
            </p>
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
              <span className="grid size-5 place-items-center rounded-full border border-line bg-elevated text-[10px] text-muted">
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
                  <span className="grid size-8 place-items-center rounded-lg border border-brand/40 bg-brand/15 shadow-sm shadow-brand/10">
                    <span className="size-1.5 rounded-full bg-brand-bright shadow-[0_0_10px_var(--color-brand)]" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-medium">
                      {challenge.title}
                    </strong>
                    <small className="text-xs text-muted">
                      {formatChallengeType(challenge.type)}
                    </small>
                  </span>
                  <ArrowRight
                    className="text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-bright"
                    size={16}
                  />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className={active.length ? "mt-10" : ""}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Completed</h2>
            <span className="grid size-5 place-items-center rounded-full border border-line bg-elevated text-[10px] text-muted">
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
                  <span className="grid size-8 place-items-center rounded-lg border border-green-400/10 bg-green-500/10 text-green-300">
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
