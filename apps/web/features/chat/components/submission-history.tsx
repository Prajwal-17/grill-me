"use client";
import { useState } from "react";
import type { PracticeSubmission, ReviewJob } from "@/shared/types/api";
import { AttemptReview } from "./attempt-review";
export function SubmissionHistory({
  attempts,
  busy,
  onRetry,
  onCancel,
}: {
  attempts: PracticeSubmission[];
  busy: boolean;
  onRetry: (review: ReviewJob, response: string | null) => void;
  onCancel: (review: ReviewJob) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = attempts.find((a) => a.id === selectedId) ?? attempts[0];
  if (!selected)
    return (
      <div className="py-12 text-center">
        <h2 className="text-lg font-semibold">No submissions yet</h2>
        <p className="mt-2 text-sm text-muted">
          Attach your code in Submit. Your reviews will appear here.
        </p>
      </div>
    );
  return (
    <section
      aria-label="Submission reviews"
      className="mx-auto w-full max-w-[900px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <h2 className="text-lg font-semibold">
          Review history{" "}
          <span className="ml-2 text-sm font-normal text-muted">
            {attempts.length}{" "}
            {attempts.length === 1 ? "submission" : "submissions"}
          </span>
        </h2>
        <select
          aria-label="Select submission"
          value={selected.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="max-w-full rounded border border-line bg-surface px-3 py-2 text-sm"
        >
          {attempts.map((a) => {
            const r = a.reviews[0];
            return (
              <option key={a.id} value={a.id}>
                Submission {a.sequence}
                {a.id === attempts[0]?.id ? " · Latest" : ""} ·{" "}
                {r?.response?.verdict.replaceAll("_", " ") ??
                  r?.status ??
                  "Saved"}
                {r?.score != null ? ` · ${r.score}/10` : ""}
              </option>
            );
          })}
        </select>
      </div>
      <AttemptReview
        key={selected.id}
        attempt={selected}
        busy={busy}
        onRetry={onRetry}
        onCancel={onCancel}
      />
    </section>
  );
}
