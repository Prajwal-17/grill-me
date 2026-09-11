"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  challengeKeys,
  getChallengeHistory,
} from "../../challenges/api/challenge-api";
import { useProfile } from "../../profile/hooks/use-profile";
import { AppShell } from "../../../shared/components/layout/app-shell";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { buttonStyles } from "../../../shared/components/ui/button";
import { HistoryDetail } from "../components/history-detail";
import { HistoryList } from "../components/history-list";

export function HistoryPage() {
  const profile = useProfile();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
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
    <AppShell profile={profile}>
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
          <main className="page">
            <h1 className="page-title">Build not found</h1>
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
