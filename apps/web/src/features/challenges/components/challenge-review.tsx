import { useState } from "react";
import { HistoryPicker } from "@/shared/components/history/history-picker";
import {
  Activity,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
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
import {
  HarnessTrajectory,
  isActiveThreadStatus,
  useHarnessThreads,
} from "@/features/harness";
import { cn } from "@/shared/lib/cn";

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
  const { strengths, improvements, nextStep } = review.result;
  if (!strengths.length && !improvements.length && !nextStep) return null;
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
      <div>
        <p className="text-metadata font-medium text-muted">Done right</p>
        {strengths.length ? (
          <ul className="mt-1.5 space-y-1 text-supporting">
            {strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-metadata text-muted">None recorded.</p>
        )}
      </div>
      <div>
        <p className="text-metadata font-medium text-muted">Fix first</p>
        {improvements.length ? (
          <ul className="mt-1.5 space-y-2 text-supporting">
            {improvements.map((finding) => (
              <li key={finding.problem}>
                <span className="block">{finding.problem}</span>
                <span className="block text-metadata text-muted">
                  {finding.fix}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-metadata text-muted">Nothing blocking.</p>
        )}
      </div>
      {nextStep && (
        <p className="text-supporting md:col-span-2">
          <span className="text-metadata font-medium text-muted">
            Next step:{" "}
          </span>
          {nextStep}
        </p>
      )}
    </div>
  );
}

export function ChallengeReviewSection({
  profileId,
  challenge,
  enabled = true,
}: {
  profileId: string;
  challenge: Challenge;
  enabled?: boolean;
}) {
  const { reviews, create } = useChallengeReviews(profileId, challenge.id, {
    enabled,
  });
  const [selectedId, setSelectedId] = useState<string>();
  const [view, setView] = useState<"scorecard" | "trajectory">("scorecard");
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
  const trajectoryThreadId = pending ? liveThread?.id : latest?.threadId;
  const showViews = Boolean(latest || pending);
  return (
    <section
      aria-label="Challenge review"
      className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {history.length > 1 && latest ? (
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
          ) : (
            <h2 className="flex items-center gap-2 text-ui font-medium">
              <ClipboardCheck
                size={15}
                className="text-muted"
                aria-hidden="true"
              />
              {reviewNumber ? `Review ${reviewNumber}` : "Review"}
            </h2>
          )}
          {latest && (
            <span className="text-metadata text-muted">
              {latest.criteriaMet}/{latest.criteriaTotal} criteria met
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {showViews && (
            <div
              role="group"
              aria-label="Review view"
              className="flex items-center rounded-md border border-line bg-surface p-0.5"
            >
              <Button
                size="sm"
                variant={view === "scorecard" ? "secondary" : "ghost"}
                aria-pressed={view === "scorecard"}
                onClick={() => setView("scorecard")}
              >
                <ClipboardCheck size={12} aria-hidden="true" />
                Scorecard
              </Button>
              <Button
                size="sm"
                variant={view === "trajectory" ? "secondary" : "ghost"}
                aria-pressed={view === "trajectory"}
                disabled={!trajectoryThreadId && !pending}
                onClick={() => setView("trajectory")}
              >
                <Activity size={12} aria-hidden="true" />
                Trajectory
                {pending && (
                  <span className="text-metadata text-muted">live</span>
                )}
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant={latest ? "secondary" : "default"}
            disabled={pending || !enabled}
            onClick={() =>
              create.mutate(undefined, {
                onSuccess: (review) => setSelectedId(review.id),
                onError: () => setView("scorecard"),
              })
            }
          >
            {pending && <LoaderCircle size={14} className="animate-spin" />}
            {latest ? "Review again" : "Review attempt"}
          </Button>
        </div>
      </div>

      {view === "trajectory" && showViews ? (
        trajectoryThreadId ? (
          <HarnessTrajectory
            profileId={profileId}
            threadId={trajectoryThreadId}
            className="min-h-0 flex-1"
          />
        ) : (
          <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center px-6 text-center">
            <LoaderCircle
              size={18}
              className="animate-spin text-muted motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p role="status" className="mt-2 text-ui font-medium">
              Starting the review run…
            </p>
            <p className="mt-1 max-w-sm text-supporting text-muted">
              The trajectory appears as soon as the harness records the first
              event.
            </p>
          </div>
        )
      ) : (
        <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[880px] space-y-3 px-4 py-4 md:px-6 md:py-5">
            {reviews.isLoading && (
              <p role="status" className="text-supporting text-muted">
                Loading reviews…
              </p>
            )}
            {reviews.error && (
              <p role="alert" className="text-supporting text-destructive">
                {reviews.error.message}
              </p>
            )}

            {!latest && !pending && !reviews.isLoading && !reviews.error && (
              <p className="text-supporting text-muted">
                Score this attempt against the challenge's completion criteria.
                The review reads your workspace and never runs the code.
              </p>
            )}

            {pending && (
              <p role="status" className="text-supporting text-muted">
                Reading the workspace and judging each criterion…
              </p>
            )}

            {create.error && (
              <p role="alert" className="text-supporting text-destructive">
                {create.error.message}
              </p>
            )}

            {latest && (
              <article
                aria-label={`Review ${reviewNumber} scorecard`}
                className="space-y-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <Verdict review={latest} />
                    <span className="text-metadata text-muted">
                      {formatDate(latest.createdAt)}
                    </span>
                  </div>
                  <span className="text-metadata text-muted">
                    {latest.model}
                  </span>
                </div>
                <Evidence review={latest} />
                <Findings review={latest} />
              </article>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
