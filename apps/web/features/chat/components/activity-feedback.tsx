import { AlertCircle } from "lucide-react";
import type { ExerciseWorkspaceState } from "@/features/chat/hooks/use-exercise-workspace";
export function ActivityFeedback({
  messages,
}: Pick<ExerciseWorkspaceState, "messages">) {
  return messages.isLoading ? (
    <p role="status" className="text-sm text-muted">
      Loading saved activity…
    </p>
  ) : messages.error ? (
    <p
      role="alert"
      className="flex items-start gap-2 text-sm leading-6 text-destructive"
    >
      <AlertCircle size={16} />
      {messages.error.message}
      <button className="underline" onClick={() => void messages.refetch()}>
        Try again
      </button>
    </p>
  ) : null;
}
