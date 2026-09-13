"use client";
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
        <PracticeWorkspace
          key={state.challenge.id}
          profile={profile}
          challenge={state.challenge}
        />
      ) : null}
    </AppShell>
  );
}
