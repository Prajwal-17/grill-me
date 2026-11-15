import {
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
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
  pass: { label: "Pass", className: "text-success", Icon: CheckCircle2 },
  partial: { label: "Partial", className: "text-warning", Icon: CircleDot },
  fail: { label: "Fail", className: "text-destructive", Icon: XCircle },
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
        <h3 className="text-metadata font-medium text-muted">Done right</h3>
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
        <h3 className="text-metadata font-medium text-muted">Fix first</h3>
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
  const latest = reviews.data?.[0];
  const previous = reviews.data?.slice(1) ?? [];
  const pending = create.isPending;
  return (
    <section
      aria-label="Challenge review"
      className="space-y-3 rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-ui font-medium">
          <ClipboardCheck size={15} className="text-muted" aria-hidden="true" />
          Review
          {latest && (
            <span className="text-metadata font-normal text-muted">
              {latest.criteriaMet}/{latest.criteriaTotal} criteria met
            </span>
          )}
        </h2>
        <Button
          size="sm"
          variant={latest ? "secondary" : "default"}
          disabled={pending || !enabled}
          onClick={() => create.mutate()}
        >
          {pending && <LoaderCircle size={14} className="animate-spin" />}
          {latest ? "Review again" : "Review attempt"}
        </Button>
      </div>

      {!latest && !pending && (
        <p className="text-supporting text-muted">
          Score this attempt against the challenge's completion criteria. The
          review reads your workspace and never runs the code.
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
        <article className="rounded-md border border-line bg-panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <Verdict review={latest} />
              <span className="text-metadata text-muted">
                {formatDate(latest.createdAt)}
              </span>
            </div>
            <span className="text-metadata text-muted">{latest.model}</span>
          </div>
          <Evidence review={latest} />
          <Findings review={latest} />
        </article>
      )}

      {previous.length > 0 && (
        <details className="text-supporting">
          <summary className="cursor-pointer text-muted">
            Previous reviews ({previous.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {previous.map((review) => (
              <li
                key={review.id}
                className="flex flex-wrap items-baseline gap-2 text-metadata"
              >
                <span className="text-muted">
                  {formatDate(review.createdAt)}
                </span>
                <Verdict review={review} />
                <span className="text-muted">
                  {review.criteriaMet}/{review.criteriaTotal} criteria met
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
