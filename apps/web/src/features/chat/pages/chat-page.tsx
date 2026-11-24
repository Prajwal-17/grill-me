import { BuildSkeleton } from "@/shared/components/ui/loading-layouts";
import { useSearchParams } from "react-router";
import { CompactShell } from "@/shared/components/layout/compact-shell";
import { AppShell } from "@/shared/components/layout/app-shell";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { PracticeWorkspace } from "@/features/chat/components/practice-workspace";
import { useSelectedChallenge } from "@/features/chat/hooks/use-selected-challenge";

export function ChatPage({ challengeId }: { challengeId: string }) {
  const profile = useProfile();
  const [params] = useSearchParams();
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
  if (state.loading) {
    return (
      <CompactShell profile={profile}>
        <BuildSkeleton
          tab={params.has("activity") ? "activity" : params.get("tab")}
        />
      </CompactShell>
    );
  }
  return (
    <AppShell
      profile={profile}
      title="Build"
      breadcrumbs={[{ label: "Challenges", href: "/challenges" }]}
      contentScrollable={false}
    >
      {state.error ? (
        <ErrorState
          title="Could not load this build"
          message={state.error.message}
          onRetry={state.retry}
        />
      ) : null}
    </AppShell>
  );
}
