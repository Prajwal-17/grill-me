import { FileSearch2 } from "lucide-react";
import type { PracticeSubmission, ReviewJob } from "@/shared/types/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { AttemptReview } from "./attempt-review";

const verdictLabel = {
  accepted: "Accepted",
  needs_revision: "Needs revision",
  needs_evidence: "Needs evidence",
};

function attemptState(attempt: PracticeSubmission) {
  const review = attempt.reviews[0];
  if (review?.response) return verdictLabel[review.response.verdict];
  if (review?.status === "running") return "Reviewing";
  if (review?.status === "queued") return "Queued";
  if (review?.status === "failed") return "Failed";
  if (review?.status === "cancelled") return "Cancelled";
  return "Saved";
}

export function SubmissionHistory({
  attempts,
  requirements,
  selectedId,
  onSelectedChange,
  busy,
  onRetry,
  onCancel,
}: {
  attempts: PracticeSubmission[];
  requirements: string[];
  selectedId: string;
  onSelectedChange: (id: string) => void;
  busy: boolean;
  onRetry: (review: ReviewJob, response: string | null) => void;
  onCancel: (review: ReviewJob) => void;
}) {
  const selected =
    attempts.find((attempt) => attempt.id === selectedId) ?? attempts[0];

  return (
    <section
      aria-label="Submission reviews"
      className="flex h-full min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-10">
        {selected ? (
          <>
            {attempts.length > 1 && (
              <div className="mx-auto mb-5 flex max-w-[820px] justify-end">
                <Select value={selected.id} onValueChange={onSelectedChange}>
                  <SelectTrigger
                    aria-label="Select submission"
                    className="h-8 w-52 bg-surface"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    {attempts.map((attempt, index) => {
                      const review = attempt.reviews[0];
                      return (
                        <SelectItem key={attempt.id} value={attempt.id}>
                          Submission {attempt.sequence}
                          {index === 0 ? " · Latest" : ""}
                          {" · "}
                          {attemptState(attempt)}
                          {review?.score != null
                            ? " " + review.score + "/10"
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <AttemptReview
              key={selected.id}
              attempt={selected}
              requirements={requirements}
              busy={busy}
              onRetry={onRetry}
              onCancel={onCancel}
            />
          </>
        ) : (
          <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
            <FileSearch2 size={22} className="text-muted" />
            <h3 className="mt-4 text-sm font-semibold">No reviews yet</h3>
            <p className="mt-1 text-sm text-muted">
              Submit an implementation to start a review.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
