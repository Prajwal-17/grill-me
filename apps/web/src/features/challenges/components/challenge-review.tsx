import { ReviewSkeleton } from "@/shared/components/ui/loading-layouts";
import { useState } from "react";
import { HistoryPicker } from "@/shared/components/history/history-picker";
import {
  Activity,
  CheckCircle2,
  CircleDot,
  CircleHelp,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import type {
  Challenge,
  ChallengeReview,
  ChallengeReviewVerdict,
  ReviewCriterionStatus,
} from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { useChallengeReviews } from "@/features/challenges/hooks/use-challenge-reviews";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";
import { isActiveThreadStatus, useHarnessThreads } from "@/features/harness";
import { cn } from "@/shared/lib/cn";
import { Markdown } from "@/shared/components/markdown";

const verdicts: Record<
  ChallengeReviewVerdict,
  { label: string; className: string }
> = {
  meets: { label: "Meets", className: "text-success" },
  partly_meets: { label: "Partly meets", className: "text-warning" },
  does_not_meet: { label: "Doesn't meet", className: "text-destructive" },
};

const statuses: Record<
  ReviewCriterionStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  pass: { label: "Met", className: "text-success", Icon: CheckCircle2 },
  partial: {
    label: "Partially met",
    className: "text-warning",
    Icon: CircleDot,
  },
  fail: { label: "Not met", className: "text-destructive", Icon: XCircle },
  unable_to_assess: {
    label: "Unable to assess",
    className: "text-muted",
    Icon: CircleHelp,
  },
};

function Verdict({ review }: { review: ChallengeReview }) {
  const value = verdicts[review.verdict];
  return (
    <span className={cn("text-supporting font-medium", value.className)}>
      {value.label}
    </span>
  );
}

function Evidence({ review }: { review: ChallengeReview }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {review.result.criteria.map((criterion) => {
        const status = statuses[criterion.status];
        return (
          <li key={criterion.criterion} className="flex gap-2">
            <status.Icon
              size={15}
              aria-hidden="true"
              className={cn("mt-0.5 shrink-0", status.className)}
            />
            <div className="min-w-0">
              <p className="text-supporting">
                <span
                  className={cn(
                    "mr-2 text-metadata font-medium uppercase tracking-wide",
                    status.className,
                  )}
                >
                  {status.label}
                </span>
                {criterion.criterion}
              </p>
              <p className="mt-0.5 break-words text-metadata text-muted">
                {criterion.path && (
                  <span className="font-mono text-foreground/80">
                    {criterion.path}
                    {criterion.line ? `:${criterion.line}` : ""}
                  </span>
                )}
                {criterion.path && " — "}
                {criterion.evidence}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Findings({ review }: { review: ChallengeReview }) {
  const { strengths, improvements } = review.result;
  if (!strengths.length && !improvements.length) return null;
  return (
    <details className="text-supporting">
      <summary className="w-fit cursor-pointer py-1.5 font-medium text-muted hover:text-foreground focus-visible:outline-offset-4">
        Strengths and improvements
      </summary>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {strengths.length > 0 && (
          <div>
            <h3 className="font-medium">Strengths</h3>
            <ul className="mt-1 space-y-1 text-muted">
              {strengths.map((strength) => (
                <li key={strength}>{strength}</li>
              ))}
            </ul>
          </div>
        )}
        {improvements.length > 0 && (
          <div>
            <h3 className="font-medium">Improvements</h3>
            <ul className="mt-1 space-y-2">
              {improvements.map(({ problem, fix }) => (
                <li key={problem}>
                  <p>{problem}</p>
                  <p className="text-muted">{fix}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function ChallengeReviewSection({
  profileId,
  challenge,
  enabled = true,
  onOpenRun,
}: {
  profileId: string;
  challenge: Challenge;
  enabled?: boolean;
  onOpenRun: (threadId: string) => void;
}) {
  const { reviews, create } = useChallengeReviews(profileId, challenge.id, {
    enabled,
  });
  const [selectedId, setSelectedId] = useState<string>();
  const history = reviews.data ?? [];
  const latest =
    history.find((review) => review.id === selectedId) ?? history[0];
  const reviewNumber = latest
    ? (latest.reviewNumber ?? history.length - history.indexOf(latest))
    : null;
  const pending = create.isPending;
  const liveRuns = useHarnessThreads(
    profileId,
    { challengeId: challenge.id, kind: "review", limit: 20 },
    { enabled: pending && enabled, refetchInterval: 1000 },
  );
  const liveThread = (liveRuns.data ?? []).find((thread) =>
    isActiveThreadStatus(thread.status),
  );
  const savedThreadId = latest?.threadId;
  return (
    <section
      aria-label="Challenge review"
      className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto w-full max-w-[1152px] space-y-4 px-4 pb-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-ui font-semibold">
            {latest ? "Review" : "Completion criteria"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {history.length > 1 && latest && (
              <HistoryPicker
                label="Review history"
                value={latest.id}
                onSelect={setSelectedId}
                entries={history.map((review, index) => ({
                  id: review.id,
                  label: `Review ${review.reviewNumber ?? history.length - index}`,
                  detail: (
                    <>
                      <span>
                        {review.criteriaMet}/{review.criteriaTotal} criteria met
                      </span>
                      <span>{formatDate(review.createdAt)}</span>
                    </>
                  ),
                }))}
              />
            )}
            <Button
              size="sm"
              variant={latest ? "secondary" : "default"}
              disabled={pending || !enabled || reviews.isLoading}
              onClick={() =>
                create.mutate(undefined, {
                  onSuccess: (review) => setSelectedId(review.id),
                })
              }
            >
              {pending && (
                <LoaderCircle
                  size={14}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              {pending
                ? "Reviewing…"
                : latest
                  ? "Review again"
                  : "Review attempt"}
            </Button>
          </div>
        </header>
        {reviews.isLoading && <ReviewSkeleton />}
        {reviews.error && (
          <p role="alert" className="text-supporting text-destructive">
            {reviews.error.message}
          </p>
        )}
        {pending && (
          <div className="flex flex-wrap items-center gap-x-2">
            <p role="status" className="text-supporting text-muted">
              Reading the workspace and checking each criterion…
            </p>
            {liveThread && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenRun(liveThread.id)}
              >
                View live run
              </Button>
            )}
          </div>
        )}
        {create.error && (
          <p role="alert" className="text-supporting text-destructive">
            {create.error.message}
          </p>
        )}
        {!latest && !reviews.isLoading && !reviews.error && (
          <div className="max-w-[76ch] space-y-2">
            {!pending && (
              <p className="text-supporting text-muted">
                The review reads your workspace and checks these criteria
                without running your code.
              </p>
            )}
            <ul className="list-disc space-y-1 pl-5 text-supporting marker:text-muted">
              {challenge.completionCriteria.map((criterion, index) => (
                <li key={index}>
                  <Markdown>{criterion}</Markdown>
                </li>
              ))}
            </ul>
          </div>
        )}
        {latest && (
          <article
            aria-label={`Review ${reviewNumber} scorecard`}
            className="max-w-[76ch] space-y-5"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-line-strong pl-3">
              <div className="shrink-0">
                <p className="font-mono text-section leading-none tabular-nums">
                  {latest.criteriaMet}
                  <span className="text-supporting text-muted">
                    /{latest.criteriaTotal}
                  </span>
                </p>
                <p className="mt-1 text-metadata text-muted">Criteria met</p>
              </div>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Verdict review={latest} />
                  <span className="text-metadata text-muted">
                    {formatDate(latest.createdAt)}
                  </span>
                  <span className="font-mono text-metadata break-all text-muted">
                    {latest.model}
                  </span>
                </div>
                {latest.result.nextStep && (
                  <p className="mt-1 text-supporting">
                    {latest.result.nextStep}
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-ui font-semibold">Completion criteria</h3>
              <Evidence review={latest} />
            </div>
            <Findings review={latest} />
            {savedThreadId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenRun(savedThreadId)}
              >
                <Activity size={14} aria-hidden="true" />
                View run in Activity
              </Button>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
