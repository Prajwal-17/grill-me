"use client";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Plus,
  Code2,
  MessageSquare,
  Network,
  Blocks,
  BookOpen,
} from "lucide-react";
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
  const Icon =
    challenge.type === "question"
      ? MessageSquare
      : challenge.type === "architecture"
        ? Network
        : challenge.type === "mini-project"
          ? Blocks
          : Code2;
  return (
    <Link
      href={
        completed ? "/history?id=" + challenge.id : "/chat?id=" + challenge.id
      }
      className="archive-row group flex items-center gap-4 border-b border-line px-4 py-5 last:border-b-0 sm:px-5"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface">
        <Icon size={18} strokeWidth={1.5} className="text-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium sm:text-base">
          {challenge.title}
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>{formatChallengeType(challenge.type)}</span>
          {completed && <span>{formatDate(challenge.completedAt)}</span>}
        </p>
      </div>
      <span className="hidden items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-xs text-muted sm:flex">
        {completed ? (
          <Check size={12} />
        ) : (
          <span className="size-1.5 rounded-full border border-current" />
        )}
        {completed ? "Completed" : "In progress"}
      </span>
      <ArrowUpRight
        size={16}
        className="shrink-0 text-muted group-hover:text-foreground"
      />
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
        <main className="page max-w-[1100px]">
          <header className="mb-10 flex items-center justify-between gap-4">
            <h1 className="page-title">Exercises</h1>
            <Link className={buttonStyles("primary")} href="/chat?new=1">
              <Plus size={16} />
              New exercise
            </Link>
          </header>
          <section>
            <h2 className="mb-4 flex items-center gap-2.5 text-sm font-medium">
              In progress
              <span className="rounded-md bg-canvas px-1.5 py-0.5 text-xs text-muted">
                {active.data?.length ?? 0}
              </span>
            </h2>
            {active.data?.length ? (
              <div className="overflow-hidden rounded-xl border border-line">
                {active.data.map((c) => (
                  <ExerciseRow key={c.id} challenge={c} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line px-6 py-10">
                <BookOpen size={22} className="mb-4 text-muted" />
                <h3 className="text-base font-medium">
                  Start your next exercise
                </h3>
                <Link
                  href="/chat?new=1"
                  className={buttonStyles("secondary") + " mt-5"}
                >
                  <Plus size={15} />
                  Create an exercise
                </Link>
              </div>
            )}
          </section>
          <section className="mt-10">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">Recently completed</h2>
              {Boolean(history.data?.length) && (
                <Link
                  href="/history"
                  className="text-xs text-muted hover:text-foreground"
                >
                  View history
                </Link>
              )}
            </header>
            {history.data?.length ? (
              <div className="overflow-hidden rounded-xl border border-line">
                {history.data.slice(0, 4).map((c) => (
                  <ExerciseRow key={c.id} challenge={c} />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-line px-5 py-5 text-sm text-muted">
                Completed exercises will appear here.
              </p>
            )}
          </section>
        </main>
      )}
    </AppShell>
  );
}
