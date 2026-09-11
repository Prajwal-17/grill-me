import { AlertCircle } from "lucide-react";
import type { ExerciseWorkspaceState } from "../hooks/use-exercise-workspace";
export function ActivityFeedback({
  messages,
}: Pick<ExerciseWorkspaceState, "messages">) {
  return messages.isLoading ? (
    <p role="status" className="text-sm text-muted">
      Loading saved activity…
    </p>
  ) : messages.error ? (
    <p role="alert" className="feedback">
      <AlertCircle size={16} />
      {messages.error.message}
      <button className="underline" onClick={() => void messages.refetch()}>
        Try again
      </button>
    </p>
  ) : null;
}
