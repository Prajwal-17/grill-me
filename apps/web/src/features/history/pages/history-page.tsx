import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "react-router";
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
  const selectedId = useSearchParams()[0].get("id");
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
  if (!history.isLoading && !history.error && selectedId && selected) {
    return (
      <HistoryDetail key={selected.id} profile={profile} selected={selected} />
    );
  }
  return (
    <AppShell
      profile={profile}
      title={selectedId ? "Build details" : "History"}
      breadcrumbs={selectedId ? [{ label: "History", href: "/history" }] : []}
      contentScrollable={false}
      actions={
        !selectedId && history.data ? (
          <span className="text-xs tabular-nums text-muted">
            {history.data.filter((c) => c.status === "completed").length}{" "}
            completed
          </span>
        ) : undefined
      }
    >
      {history.isLoading ? (
        <LoadingScreen label="Loading history…" />
      ) : history.error ? (
        <ErrorState
          title="Could not load history"
          message={history.error.message}
          onRetry={() => void history.refetch()}
        />
      ) : selectedId ? (
        <main className="mx-auto w-full max-w-[1100px] px-5 pb-12 pt-7 md:px-10 md:pb-16 md:pt-11">
          <h2 className="text-xl font-semibold">Build not found</h2>
          <p className="mt-3 text-sm text-muted">
            This build is not in your completed history.
          </p>
          <Link to="/history" className={buttonStyles("secondary") + " mt-5"}>
            <ArrowLeft size={15} />
            Back to history
          </Link>
        </main>
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
