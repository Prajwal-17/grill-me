"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  challengeKeys,
  getChallengeHistory,
} from "@/features/challenges/api/challenge-api";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { AppShell } from "@/shared/components/layout/app-shell";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import { buttonStyles } from "@/shared/components/ui/button";
import { HistoryDetail } from "@/features/history/components/history-detail";
import { HistoryList } from "@/features/history/components/history-list";
import type { HistoryScope } from "@/features/history/components/history-filters";

export function HistoryPage() {
  const profile = useProfile();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<HistoryScope>("all");
  const selectedId = useSearchParams().get("id");
  const history = useQuery({
    queryKey: challengeKeys.history(profile?.id),
    queryFn: () => getChallengeHistory(profile!.id),
    enabled: Boolean(profile),
  });
  const selected = history.data?.find(
    (challenge) => challenge.id === selectedId,
  );
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  return (
    <AppShell profile={profile} contentScrollable={false}>
      {history.isLoading ? (
        <LoadingScreen label="Loading history…" />
      ) : history.error ? (
        <ErrorState
          title="Could not load history"
          message={history.error.message}
          onRetry={() => void history.refetch()}
        />
      ) : selectedId ? (
        selected ? (
          <HistoryDetail
            key={selected.id}
            profile={profile}
            selected={selected}
          />
        ) : (
          <main className="mx-auto w-full max-w-[1100px] px-5 pb-12 pt-7 md:px-10 md:pb-16 md:pt-11">
            <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.025em]">
              Build not found
            </h1>
            <p className="mt-3 text-sm text-muted">
              This build is not in your completed history.
            </p>
            <Link
              href="/history"
              className={buttonStyles("secondary") + " mt-5"}
            >
              <ArrowLeft size={15} />
              Back to history
            </Link>
          </main>
        )
      ) : (
        <HistoryList
          profileId={profile.id}
          challenges={history.data ?? []}
          search={search}
          setSearch={setSearch}
          scope={scope}
          setScope={setScope}
        />
      )}
    </AppShell>
  );
}
