"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCode2,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  SearchCheck,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import type { PracticeSubmission, ReviewJob } from "@/shared/types/api";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Markdown } from "@/shared/components/markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/cn";

const verdicts = {
  accepted: {
    label: "Accepted",
    icon: CheckCircle2,
    className: "text-success",
  },
  needs_revision: {
    label: "Needs revision",
    icon: AlertTriangle,
    className: "text-warning",
  },
  needs_evidence: {
    label: "Needs evidence",
    icon: SearchCheck,
    className: "text-warning",
  },
};

function formatDate(value: string) {
  return (
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

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
    attempt.reviews.find((item) => item.id === selectedReview) ??
    attempt.reviews[0];
  const [responding, setResponding] = useState(false);
  const [response, setResponse] = useState("");
  const result = review?.response;
  const running = review?.status === "queued" || review?.status === "running";
  const verdict = result ? verdicts[result.verdict] : null;
  const VerdictIcon = verdict?.icon;

  return (
    <article className="mx-auto w-full max-w-[820px]">
      <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            Submission {attempt.sequence}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Clock3 size={12} />
            <time dateTime={attempt.createdAt}>
              {formatDate(attempt.createdAt)}
            </time>
          </p>
        </div>
        {attempt.reviews.length > 1 && (
          <Select
            value={review?.id ?? ""}
            onValueChange={(value) => {
              setSelectedReview(value);
              setResponding(false);
            }}
          >
            <SelectTrigger
              aria-label="Select review run"
              className="h-8 w-full sm:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {attempt.reviews.map((item, index) => (
                <SelectItem key={item.id} value={item.id}>
                  Review {attempt.reviews.length - index}
                  {index === 0 ? " · Latest" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {running && review && (
        <div role="status" className="flex items-center gap-3 py-8">
          <LoaderCircle size={17} className="animate-spin" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Reviewing submission</p>
            <p className="mt-1 truncate text-xs text-muted">
              {review.progress || "Inspecting your implementation…"}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onCancel(review)}>
            Cancel
          </Button>
        </div>
      )}

      {review?.error && (
        <div className="border-b border-line py-6">
          <div className="flex items-start gap-3">
            <XCircle size={17} className="mt-0.5 text-destructive" />
            <div>
              <p role="alert" className="text-sm font-medium">
                Review failed
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {review.error}
              </p>
              <Button
                className="mt-3"
                size="sm"
                disabled={busy}
                onClick={() => onRetry(review, null)}
              >
                <RotateCcw size={14} />
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {review?.status === "cancelled" && !review.error && (
        <div className="flex items-center justify-between gap-3 border-b border-line py-5">
          <p className="text-sm text-muted">Review cancelled</p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onRetry(review, null)}
          >
            <RotateCcw size={14} />
            Retry
          </Button>
        </div>
      )}

      {result && verdict && VerdictIcon && review && (
        <>
          <section className="border-b border-line py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <VerdictIcon
                  size={19}
                  className={cn("shrink-0", verdict.className)}
                />
                <h3 className={cn("text-lg font-semibold", verdict.className)}>
                  {verdict.label}
                </h3>
              </div>
              <p className="font-mono text-xl font-semibold tabular-nums">
                {review.score === null ? "—" : review.score}
                <span className="text-xs font-normal text-muted">/10</span>
              </p>
            </div>
            <div className="mt-5 text-[15px] leading-7">
              <Markdown>{result.summary}</Markdown>
            </div>
          </section>

          {result.nextStep && (
            <section className="border-b border-line py-5">
              <h4 className="text-sm font-semibold">Next step</h4>
              <p className="mt-2 text-sm leading-6">{result.nextStep}</p>
            </section>
          )}

          {!!result.findings.length && (
            <section className="border-b border-line py-6">
              <h4 className="text-sm font-semibold">Findings</h4>
              <div className="mt-4 divide-y divide-line">
                {result.findings.map((finding, index) => (
                  <div key={index} className="py-4 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{finding.issue}</p>
                    {finding.location && (
                      <code className="mt-1 block break-all font-mono text-[11px] text-muted">
                        {finding.location}
                      </code>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                      {finding.evidence}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!result.optionalImprovements.length && (
            <section className="border-b border-line py-5">
              <h4 className="text-sm font-semibold">Suggestions</h4>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
                {result.optionalImprovements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {result.question && (
            <section className="border-b border-line py-5">
              <div className="flex items-start gap-2">
                <MessageSquare size={15} className="mt-1 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold">Reviewer question</h4>
                  <p className="mt-2 text-sm leading-6">{result.question}</p>
                </div>
              </div>
            </section>
          )}

          <div className="border-b border-line py-5">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setResponding(!responding)}
            >
              <MessageSquare size={14} />
              {result.question ? "Answer question" : "Reply to review"}
            </Button>
            {responding && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (response.trim()) onRetry(review, response);
                }}
                className="mt-4 space-y-3"
              >
                <Textarea
                  aria-label="Response to review"
                  placeholder="Add context for the reviewer…"
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  rows={4}
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy || !response.trim()}
                >
                  Reassess submission
                </Button>
              </form>
            )}
          </div>

          <details className="group border-b border-line py-4 text-sm">
            <summary className="flex list-none items-center gap-2 text-muted hover:text-foreground">
              <ChevronRight
                size={14}
                className="transition-transform group-open:rotate-90"
              />
              Assessment details
            </summary>
            <div className="mt-5 space-y-6 pl-5">
              <dl className="space-y-4">
                {[
                  ["Correctness", result.correctness, 4],
                  ["Implementation reasoning", result.understanding, 3],
                  ["Engineering judgment", result.judgment, 3],
                ].map(([label, dimension, max]) => {
                  const value = dimension as typeof result.correctness;
                  return (
                    <div key={label as string}>
                      <dt className="text-xs font-medium">
                        {label as string}:{" "}
                        {value.score === null
                          ? "Unassessed"
                          : value.score + "/" + max}
                      </dt>
                      <dd className="mt-1 text-xs leading-5 text-muted">
                        {value.evidence}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <div>
                <h4 className="text-xs font-medium">Completion criteria</h4>
                <ul className="mt-2 divide-y divide-line">
                  {result.criteria.map((criterion) => (
                    <li key={criterion.id} className="py-2 text-xs">
                      <span className="font-medium">
                        {criterion.id} · {criterion.status}
                      </span>
                      <p className="mt-1 leading-5 text-muted">
                        {criterion.evidence}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-medium">
                  Submitted files ({attempt.manifest.length})
                </h4>
                <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto font-mono text-[10px] text-muted">
                  {attempt.manifest.map((file) => (
                    <li key={file.path} className="flex gap-2">
                      <FileCode2 size={12} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1 break-all">
                        {file.path}
                      </span>
                      <span className="shrink-0">
                        {formatBytes(file.bytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted">
                {review.judge === "codex" ? "Project review" : "Direct review"}
                {" · "}
                {result.verification === "checks_run"
                  ? "Checks run"
                  : result.verification === "incomplete"
                    ? "Verification incomplete"
                    : "Inspection only"}
                {" · "}
                {attempt.assistance.guidance
                  ? "Guidance used"
                  : attempt.assistance.hints
                    ? attempt.assistance.hints + " hints used"
                    : "No hints used"}
              </p>
            </div>
          </details>
        </>
      )}

      {review?.judge === "codex" && (
        <details className="group py-4 text-xs text-muted">
          <summary className="flex list-none items-center gap-2 hover:text-foreground">
            <TerminalSquare size={14} />
            Review logs
          </summary>
          <div className="mt-3 pl-5">
            {review.aiLogId ? (
              <Link
                className="text-foreground underline underline-offset-4"
                href={"/logs/" + review.aiLogId}
              >
                Open saved review activity
              </Link>
            ) : (
              <p>No direct log is available for this review.</p>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
