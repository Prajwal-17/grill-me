import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";
import { BuildSkeleton } from "@/shared/components/ui/loading-layouts";
import { AppShell } from "@/shared/components/layout/app-shell";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { PracticeWorkspace } from "@/features/chat/components/practice-workspace";
import { useSelectedChallenge } from "@/features/chat/hooks/use-selected-challenge";

export function ChatPage({ challengeId }: { challengeId: string }) {
  const profile = useProfile();
  const state = useSelectedChallenge({
    profile,
    challengeId,
    createNew: false,
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  if (!state.loading && !state.error && state.challenge) {
    return (
      <PracticeWorkspace
        key={state.challenge.id}
        profile={profile}
        challenge={state.challenge}
      />
    );
  }
  return (
    <AppShell
      profile={profile}
      title="Build"
      breadcrumbs={[{ label: "Challenges", href: "/challenges" }]}
      contentScrollable={false}
      actions={
        state.loading ? (
          <LoadingRegion
            label="Loading build actions…"
            className="flex h-8 items-center gap-2"
          >
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-32" />
          </LoadingRegion>
        ) : undefined
      }
    >
      {state.loading ? (
        <BuildSkeleton />
      ) : state.error ? (
        <ErrorState
          title="Could not load this build"
          message={state.error.message}
          onRetry={state.retry}
        />
      ) : null}
    </AppShell>
  );
}
