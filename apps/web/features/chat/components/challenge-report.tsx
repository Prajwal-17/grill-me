import { Check, FileText, ClipboardCheck } from "lucide-react";
import type { Challenge, ChatMessage } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";

export function ChallengeReport({
  challenge,
  messages,
  onReview,
}: {
  challenge: Challenge;
  messages: ChatMessage[];
  onReview: () => void;
}) {
  const submissions = messages.filter(
    (m) => m.role === "user" && m.mode === "review",
  );
  const reviews = messages.filter(
    (m) => m.role === "assistant" && m.mode === "review",
  );
  const events = messages.filter(
    (m) => m.mode === "review" || m.mode === "hint",
  );
  return (
    <div className="mx-auto w-full max-w-[76ch]">
      <p className="mb-3 truncate text-xs text-muted">{challenge.title}</p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 text-sm [&>dt]:border-b [&>dt]:border-line [&>dt]:py-3 [&>dt]:text-muted [&>dd]:border-b [&>dd]:border-line [&>dd]:py-3 [&>dd]:text-right">
        <dt>Status</dt>
        <dd
          className={
            challenge.status === "completed" ? "text-success" : undefined
          }
        >
          {challenge.status === "completed" ? "Marked complete" : "In progress"}
        </dd>
        <dt>Started</dt>
        <dd>{formatDate(challenge.createdAt)}</dd>
        {challenge.completedAt && (
          <>
            <dt>Completed</dt>
            <dd>{formatDate(challenge.completedAt)}</dd>
          </>
        )}
        <dt>Solutions submitted</dt>
        <dd>{submissions.length}</dd>
        <dt>Reviews received</dt>
        <dd>{reviews.length}</dd>
        <dt>Hint</dt>
        <dd>{challenge.hint ? "Used" : "Not used"}</dd>
      </dl>
      {reviews.length > 0 && (
        <Button className="mt-5" onClick={onReview}>
          <ClipboardCheck size={15} />
          Read feedback
        </Button>
      )}
      <section className="mt-10">
        <h2 className="text-[15px] font-semibold">Saved activity</h2>
        {events.length ? (
          <ol className="mt-4 divide-y divide-line">
            {events.map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-4">
                {m.mode === "review" && m.role === "user" ? (
                  <FileText size={16} className="mt-0.5 text-muted" />
                ) : (
                  <Check size={16} className="mt-0.5 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {m.mode === "hint"
                      ? "Hint received"
                      : m.role === "user"
                        ? "Solution submitted"
                        : "Review received"}
                  </p>
                  {m.attachments.length > 0 && (
                    <p className="mt-1 break-words text-xs text-muted">
                      {m.attachments.map((f) => f.filename).join(", ")}
                    </p>
                  )}
                </div>
                <time
                  dateTime={m.createdAt}
                  className="shrink-0 text-xs text-muted"
                >
                  {formatDate(m.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Submit a solution to start your report.
          </p>
        )}
      </section>
    </div>
  );
}
