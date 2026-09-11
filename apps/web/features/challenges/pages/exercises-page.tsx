"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppShell } from "../../../shared/components/app-header";
import { buttonStyles } from "../../../shared/components/ui/button";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import {
  challengeKeys,
  getActiveChallenges,
  getChallengeHistory,
} from "../api/challenge-api";
import { formatChallengeType, formatDate } from "../lib/challenge-formatters";
import type { Challenge } from "../../../shared/types/api";
function ExerciseRow({ challenge }: { challenge: Challenge }) {
  const completed = challenge.status === "completed";
  return (
    <Link
      href={
        completed ? "/history?id=" + challenge.id : "/chat?id=" + challenge.id
      }
      className="exercise-row"
    >
      <div className="min-w-0">
        <h3 className="truncate text-base font-medium">{challenge.title}</h3>
        <p className="mt-1 text-xs text-muted">
          {formatChallengeType(challenge.type)}
          {completed ? " · " + formatDate(challenge.completedAt) : ""}
        </p>
      </div>
      {completed ? (
        <Check size={16} className="text-muted" aria-label="Completed" />
      ) : (
        <ArrowUpRight size={17} className="text-muted" />
      )}
    </Link>
  );
}
export function ExercisesPage() {
  const profile = useProfile();
  const active = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const history = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  const error = active.error ?? history.error;
  return (
    <AppShell profile={profile}>
      {active.isLoading || history.isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorState
          title="Could not load exercises"
          message={error.message}
          onRetry={() => {
            void active.refetch();
            void history.refetch();
          }}
        />
      ) : (
        <main className="page max-w-[1000px]">
          <header className="mb-10 flex items-center justify-between gap-4">
            <h1 className="page-title">Exercises</h1>
            <Link className={buttonStyles("secondary")} href="/chat?new=1">
              <Plus size={16} />
              New exercise
            </Link>
          </header>
          <section>
            <h2 className="section-heading mb-2">
              In progress{" "}
              <span className="ml-2 text-xs font-normal text-muted">
                {active.data?.length ?? 0}
              </span>
            </h2>
            {active.data?.length ? (
              active.data.map((challenge) => (
                <ExerciseRow key={challenge.id} challenge={challenge} />
              ))
            ) : (
              <div className="border-y border-line py-12">
                <p className="text-sm text-muted">No exercises in progress.</p>
                <Link
                  href="/chat?new=1"
                  className="mt-3 inline-block text-sm underline underline-offset-4"
                >
                  Create your first exercise
                </Link>
              </div>
            )}
          </section>
          <section className="mt-10">
            <header className="mb-2 flex items-center justify-between">
              <h2 className="section-heading">Completed</h2>
              {Boolean(history.data?.length) && (
                <Link
                  href="/history"
                  className="text-xs text-muted underline underline-offset-4"
                >
                  View history
                </Link>
              )}
            </header>
            {history.data?.length ? (
              history.data
                .slice(0, 5)
                .map((challenge) => (
                  <ExerciseRow key={challenge.id} challenge={challenge} />
                ))
            ) : (
              <p className="border-t border-line py-5 text-sm text-muted">
                No completed exercises yet.
              </p>
            )}
          </section>
        </main>
      )}
    </AppShell>
  );
}
