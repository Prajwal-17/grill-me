"use client";
import { AppShell } from "../../../shared/components/layout/app-shell";
import {
  ErrorState,
  LoadingScreen,
} from "../../../shared/components/ui/feedback";
import { useProfile } from "../../profile/hooks/use-profile";
import { CreateExercise } from "../components/create-exercise";
import { ExerciseWorkspace } from "../components/exercise-workspace";
import { useExerciseWorkspace } from "../hooks/use-exercise-workspace";

export function ChatPage({
  challengeId,
  createNew = false,
}: {
  challengeId?: string;
  createNew?: boolean;
}) {
  const profile = useProfile();
  const state = useExerciseWorkspace({ profile, challengeId, createNew });
  if (profile === undefined) return <LoadingScreen />;
  if (!profile) return null;
  return (
    <AppShell profile={profile}>
      {state.loading ? (
        <LoadingScreen />
      ) : state.error ? (
        <ErrorState
          title="Could not load this exercise"
          message={state.error.message}
          onRetry={state.retry}
        />
      ) : state.challenge ? (
        <ExerciseWorkspace state={{ ...state, challenge: state.challenge }} />
      ) : (
        <CreateExercise profile={profile} />
      )}
    </AppShell>
  );
}
