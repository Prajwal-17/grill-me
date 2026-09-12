"use client";
import { AppShell } from "@/shared/components/layout/app-shell";
import { ErrorState, LoadingScreen } from "@/shared/components/ui/feedback";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { ChallengeWorkspace } from "@/features/chat/components/challenge-workspace";
import { useChallengeWorkspace } from "@/features/chat/hooks/use-challenge-workspace";

export function ChatPage({ challengeId }: { challengeId: string }) {
  const profile = useProfile();
  const state = useChallengeWorkspace({
    profile,
    challengeId,
    createNew: false,
  });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  return (
    <AppShell profile={profile}>
      {state.loading ? (
        <LoadingScreen />
      ) : state.error ? (
        <ErrorState
          title="Could not load this build"
          message={state.error.message}
          onRetry={state.retry}
        />
      ) : state.challenge ? (
        <ChallengeWorkspace state={{ ...state, challenge: state.challenge }} />
      ) : null}
    </AppShell>
  );
}
