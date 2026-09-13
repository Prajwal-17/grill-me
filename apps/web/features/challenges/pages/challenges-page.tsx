"use client";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Blocks,
  BookOpen,
  Bookmark,
  Check,
  Network,
  Plus,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { AppShell } from "@/shared/components/layout/app-shell";
import { buttonStyles } from "@/shared/components/ui/button";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import {
  challengeKeys,
  getActiveChallenges,
  getSavedChallenges,
  getChallengeHistory,
} from "@/features/challenges/api/challenge-api";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";
import type { Challenge } from "@/shared/types/api";
import { ChallengeMetadata } from "@/features/challenges/components/challenge-metadata";

function ChallengeRow({ challenge }: { challenge: Challenge }) {
  const completed = challenge.status === "completed";
  const Icon =
    challenge.scope === "system"
      ? Network
      : challenge.scope === "feature"
        ? Blocks
        : Target;
  return (
    <Link
      href={
        completed ? "/history?id=" + challenge.id : "/chat?id=" + challenge.id
      }
      className="transition-colors hover:bg-canvas group flex items-center gap-4 border-b border-line px-4 py-5 last:border-b-0 sm:px-5"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface">
        <Icon size={18} strokeWidth={1.5} className="text-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium sm:text-base">
          <span className="mr-2 font-normal text-muted">
            #{challenge.number}
          </span>
          {challenge.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ChallengeMetadata challenge={challenge} compact />
          {completed && (
            <span className="text-xs text-muted">
              {formatDate(challenge.completedAt)}
            </span>
          )}
        </div>
      </div>
      <span className="hidden items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-xs text-muted sm:flex">
        {completed ? (
          <Check size={12} />
        ) : (
          <span className="size-1.5 rounded-full border border-current" />
        )}
        {completed
          ? "Completed"
          : challenge.status === "saved"
            ? "Saved for later"
            : challenge.status === "paused"
              ? "Paused"
              : "In progress"}
      </span>
      <ArrowUpRight
        size={16}
        className="shrink-0 text-muted group-hover:text-foreground"
      />
    </Link>
  );
}

export function ChallengesPage() {
  const profile = useProfile();
  const active = useQuery({
    queryKey: challengeKeys.active(profile?.id),
    queryFn: () => getActiveChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const saved = useQuery({
    queryKey: challengeKeys.saved(profile?.id),
    queryFn: () => getSavedChallenges(profile!.id),
    enabled: Boolean(profile),
  });
  const history = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  const error = active.error ?? saved.error ?? history.error;
  return (
    <AppShell profile={profile}>
      {active.isLoading || saved.isLoading || history.isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorState
          title="Could not load challenges"
          message={error.message}
          onRetry={() => {
            void active.refetch();
            void saved.refetch();
            void history.refetch();
          }}
        />
      ) : (
        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-line px-5 py-4 md:px-10">
            <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4">
              <h1 className="text-xl font-semibold tracking-[-0.02em]">
                Challenges
              </h1>
              <Link className={buttonStyles("primary")} href="/">
                <Plus size={16} />
                New build
              </Link>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-12 pt-7 md:px-10 md:pb-16 md:pt-8">
            <div className="mx-auto w-full max-w-[1100px]">
              <section>
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-medium">
                  In progress
                  <span className="rounded-md bg-canvas px-1.5 py-0.5 text-xs text-muted">
                    {active.data?.length ?? 0}
                  </span>
                </h2>
                {active.data?.length ? (
                  <div className="overflow-hidden rounded-xl border border-line">
                    {active.data.map((challenge) => (
                      <ChallengeRow key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-line px-6 py-10">
                    <BookOpen size={22} className="mb-4 text-muted" />
                    <h3 className="text-base font-medium">
                      Start your next build
                    </h3>
                    <Link
                      href="/"
                      className={buttonStyles("secondary") + " mt-5"}
                    >
                      <Plus size={15} />
                      Create build
                    </Link>
                  </div>
                )}
              </section>
              <section className="mt-10" aria-label="Saved for later">
                <h2 className="mb-4 flex items-center gap-2.5 text-sm font-medium">
                  <Bookmark size={15} /> Saved for later
                  <span className="rounded-md bg-canvas px-1.5 py-0.5 text-xs text-muted">
                    {saved.data?.length ?? 0}
                  </span>
                </h2>
                {saved.data?.length ? (
                  <div className="overflow-hidden rounded-xl border border-line">
                    {saved.data.map((challenge) => (
                      <ChallengeRow key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-line px-5 py-5 text-sm text-muted">
                    Good challenge, wrong time? Save it for later and return
                    when you’re ready.
                  </p>
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
                    {history.data.slice(0, 4).map((challenge) => (
                      <ChallengeRow key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-line px-5 py-5 text-sm text-muted">
                    Completed challenges will appear here.
                  </p>
                )}
              </section>
            </div>
          </div>
        </main>
      )}
    </AppShell>
  );
}
