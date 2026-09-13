"use client";
import { useState } from "react";
import Link from "next/link";
import { CopyButton } from "@/shared/components/ui/copy-button";
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
  const [selectedReview, setSelectedReview] = useState("");
  const review =
    attempt.reviews.find((r) => r.id === selectedReview) ?? attempt.reviews[0];
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
      {attempt.reviews.length > 1 && (
        <label className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
          Review run
          <select
            aria-label="Select review run"
            value={review?.id ?? ""}
            onChange={(e) => {
              setSelectedReview(e.target.value);
              setResponding(false);
            }}
            className="rounded border border-line bg-surface px-3 py-2 text-sm text-foreground"
          >
            {attempt.reviews.map((r, index) => (
              <option key={r.id} value={r.id}>
                Review {attempt.reviews.length - index}
                {index === 0 ? " · Latest" : ""} ·{" "}
                {r.response ? verdicts[r.response.verdict] : r.status}
              </option>
            ))}
          </select>
        </label>
      )}
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
                  ["Implementation reasoning", result.understanding, 3],
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
      {review?.judge === "codex" && (
        <details className="mt-5 border-t border-line pt-4 text-xs text-muted">
          <summary className="cursor-pointer">Codex session and logs</summary>
          <div className="mt-3 space-y-3">
            {review.aiLogId ? (
              <Link
                className="inline-block text-sm text-foreground underline underline-offset-4"
                href={"/logs/" + review.aiLogId}
              >
                Open saved prompt, response and tool activity
              </Link>
            ) : (
              <p>
                This older review has no direct log link. Its saved records may
                be available in Logs.
              </p>
            )}
            {review.providerThreadId && (
              <>
                <p>
                  View this session with the same Codex account and home used by
                  Grill Me:
                </p>
                <div className="flex items-start justify-between gap-2 rounded border border-line p-3">
                  <code className="break-all text-foreground">
                    codex resume {review.providerThreadId}
                  </code>
                  <CopyButton
                    text={"codex resume " + review.providerThreadId}
                    label="Copy Codex resume command"
                  />
                </div>
                <p>
                  Use Grill Me for further reviews so its file tools remain
                  available. Sessions created before persistent history was
                  enabled cannot be resumed.
                </p>
              </>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
