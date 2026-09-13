"use client";
import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { PracticeSubmission, ReviewJob } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Markdown } from "@/shared/components/markdown";
const verdicts = {
  accepted: "Accepted",
  needs_revision: "Needs revision",
  needs_evidence: "Needs evidence",
};
export function AttemptReview({
  attempt,
  onRetry,
  onCancel,
  busy,
}: {
  attempt: PracticeSubmission;
  onRetry: (review: ReviewJob, response: string | null) => void;
  onCancel: (review: ReviewJob) => void;
  busy: boolean;
}) {
  const review = attempt.reviews[0];
  const [responding, setResponding] = useState(false);
  const [response, setResponse] = useState("");
  const result = review?.response;
  const running = review?.status === "queued" || review?.status === "running";
  return (
    <article
      className="border-t border-line py-6"
      aria-label={"Submission " + attempt.sequence}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Submission {attempt.sequence}</h3>
          {result?.verdict === "accepted" && (
            <Check size={16} className="text-success" />
          )}
        </div>
        <span className="text-xs text-muted">
          {attempt.assistance.guidance
            ? "Approach guidance used"
            : attempt.assistance.hints
              ? `${attempt.assistance.hints} hints used`
              : "No hints used"}
        </span>
      </header>
      {review && (
        <p className="mt-2 text-xs text-muted">
          {review.judge === "codex" ? "Project review" : "Direct review"}
          {result
            ? ` · ${result.verification === "checks_run" ? "Checks run" : result.verification === "incomplete" ? "Verification incomplete" : "Code inspected; execution unverified"}`
            : ""}
        </p>
      )}
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer">
          Submitted files ({attempt.manifest.length})
        </summary>
        <ul className="mt-2 space-y-1 break-all">
          {attempt.manifest.map((f) => (
            <li key={f.path}>{f.path}</li>
          ))}
        </ul>
        {attempt.content && (
          <div className="mt-3">
            <Markdown>{attempt.content}</Markdown>
          </div>
        )}
      </details>
      {running && (
        <div role="status" className="mt-5 flex items-center gap-3 text-sm">
          <LoaderCircle size={16} className="animate-spin" />
          {review.progress}
          <Button size="sm" variant="ghost" onClick={() => onCancel(review)}>
            Cancel
          </Button>
        </div>
      )}
      {review?.error && (
        <div className="mt-4 rounded-lg border border-line p-4">
          <p role="alert" className="text-sm">
            {review.error}
          </p>
          <p className="mt-2 text-xs text-muted">Your submission is saved.</p>
          <Button
            className="mt-3"
            size="sm"
            disabled={busy}
            onClick={() => onRetry(review, null)}
          >
            Retry review
          </Button>
        </div>
      )}
      {review?.status === "cancelled" && !review.error && (
        <Button
          className="mt-3"
          size="sm"
          disabled={busy}
          onClick={() => onRetry(review, null)}
        >
          Retry review
        </Button>
      )}
      {result && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p
              className={
                result.verdict === "accepted"
                  ? "font-medium text-success"
                  : "font-medium"
              }
            >
              {verdicts[result.verdict]}
            </p>
            <p className="text-sm">
              {review.score === null ? (
                "Score partially assessed"
              ) : (
                <>
                  Submission score{" "}
                  <strong className="ml-1 text-lg tabular-nums">
                    {review.score}/10
                  </strong>
                </>
              )}
            </p>
          </div>
          <Markdown>{result.summary}</Markdown>
          {!!result.findings.length && (
            <div className="space-y-4">
              {result.findings.map((finding, i) => (
                <div key={i} className="border-l-2 border-destructive/50 pl-4">
                  <p className="text-sm font-medium">{finding.issue}</p>
                  <p className="mt-1 text-xs text-muted">
                    {finding.criterionId}
                    {finding.location ? ` · ${finding.location}` : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {finding.evidence}
                  </p>
                </div>
              ))}
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">
              Scores and evidence
            </summary>
            <dl className="mt-3 space-y-3">
              {(
                [
                  ["Correctness", result.correctness, 4],
                  ["Understanding", result.understanding, 3],
                  ["Engineering judgment", result.judgment, 3],
                ] as const
              ).map(([label, dimension, max]) => (
                <div key={label}>
                  <dt className="font-medium">
                    {label}:{" "}
                    {dimension.score === null
                      ? "Unassessed"
                      : `${dimension.score}/${max}`}
                  </dt>
                  <dd className="mt-1 leading-6 text-muted">
                    {dimension.evidence}
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="mt-4 space-y-2">
              {result.criteria.map((criterion) => (
                <li key={criterion.id}>
                  <span className="font-medium">
                    {criterion.id}: {criterion.status}
                  </span>
                  <p className="text-muted">{criterion.evidence}</p>
                </li>
              ))}
            </ul>
          </details>
          {!!result.optionalImprovements.length && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">
                Optional improvements
              </summary>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {result.optionalImprovements.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </details>
          )}
          {result.nextStep && (
            <p className="text-sm leading-6">{result.nextStep}</p>
          )}
          {result.question && (
            <p className="text-sm font-medium leading-6">{result.question}</p>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setResponding(!responding)}
          >
            {result.question ? "Answer question" : "Discuss this review"}
          </Button>
          {responding && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (response.trim()) onRetry(review, response);
              }}
              className="space-y-3"
            >
              <Textarea
                aria-label="Response to review"
                placeholder="Explain your reasoning or identify a finding you disagree with."
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={3}
              />
              <Button type="submit" disabled={busy || !response.trim()}>
                Reassess this submission
              </Button>
            </form>
          )}
        </div>
      )}
      {attempt.reviews.length > 1 && (
        <details className="mt-4 text-xs text-muted">
          <summary className="cursor-pointer">
            Earlier reviews ({attempt.reviews.length - 1})
          </summary>
          {attempt.reviews.slice(1).map((r) => (
            <div key={r.id} className="mt-3 border-t border-line pt-3">
              <p>
                {r.response ? verdicts[r.response.verdict] : r.status}
                {r.score !== null ? ` · ${r.score}/10` : ""}
              </p>
              <p className="mt-1">{r.response?.summary ?? r.error}</p>
              {r.followup && (
                <p className="mt-1">Your response: {r.followup}</p>
              )}
            </div>
          ))}
        </details>
      )}
    </article>
  );
}
