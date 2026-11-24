import type { ReactNode } from "react";
import { ChallengePrompt } from "@/features/challenges/components/challenge-prompt";
import {
  buildMetadata,
  formatBuildDifficulty,
  formatDate,
} from "@/features/challenges/lib/challenge-formatters";
import {
  statementBody,
  statementMarkdown,
} from "@/features/challenges/lib/challenge-statement";
import { Markdown } from "@/shared/components/markdown";
import { CopyButton } from "@/shared/components/ui/copy-button";
import type { Challenge } from "@/shared/types/api";

const STATUS = {
  active: { label: "In progress", className: "text-warning" },
  paused: { label: "Paused", className: "text-muted" },
  stopped: { label: "Stopped", className: "text-muted" },
  saved: { label: "Archived", className: "text-muted" },
  completed: { label: "Completed", className: "text-success" },
} satisfies Record<Challenge["status"], { label: string; className: string }>;

export function ChallengeOverview({
  challenge,
  archived,
  actions,
}: {
  challenge: Challenge;
  archived: boolean;
  actions: ReactNode;
}) {
  const status = STATUS[archived ? "saved" : challenge.status];
  const difficulty =
    challenge.estimatedDifficultyScore === null
      ? challenge.difficulty
      : challenge.contextualDifficulty;
  const facts = buildMetadata(challenge).map(({ label, value }) => ({
    label,
    value:
      label === "Difficulty" ? (
        <span data-difficulty={difficulty}>
          {formatBuildDifficulty(difficulty)}
          {challenge.estimatedDifficultyScore !== null && ` · ${value}`}
        </span>
      ) : (
        value
      ),
  }));

  return (
    <div className="mx-auto w-full max-w-[1152px] px-4 pb-8 sm:px-6">
      <div className="@container">
        <div className="grid items-start gap-y-4 @min-[680px]:grid-cols-[minmax(0,1fr)_13rem] @min-[680px]:gap-x-8 @min-[1000px]:grid-cols-[minmax(0,1fr)_14rem]">
          <aside
            aria-label="Challenge facts and actions"
            className="@min-[680px]:sticky @min-[680px]:top-0 @min-[680px]:col-start-2 @min-[680px]:row-start-1 @min-[680px]:border-l @min-[680px]:border-line @min-[680px]:pl-4"
          >
            <dl className="grid grid-cols-2 gap-x-4 min-[520px]:grid-cols-3 @min-[680px]:grid-cols-1">
              <Fact label="Status">
                <span
                  className={`inline-flex items-center gap-1.5 ${status.className}`}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-current"
                  />
                  {status.label}
                </span>
              </Fact>
              {facts.map(({ label, value }) => (
                <Fact key={label} label={label}>
                  {value}
                </Fact>
              ))}
              <Fact label="Created">{formatDate(challenge.createdAt)}</Fact>
              {challenge.completedAt && (
                <Fact label="Completed">
                  {formatDate(challenge.completedAt)}
                </Fact>
              )}
            </dl>
            <div
              role="group"
              aria-label="Challenge actions"
              className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-3 @min-[680px]:flex-col @min-[680px]:items-start"
            >
              {actions}
              <CopyButton
                text={statementMarkdown(challenge)}
                label="Copy challenge"
              />
            </div>
          </aside>
          <article className="min-w-0 @min-[680px]:col-start-1 @min-[680px]:row-start-1">
            <div className="max-w-[76ch] text-reading [overflow-wrap:anywhere]">
              <ChallengePrompt challenge={challenge} />
              <Markdown variant="reading">{statementBody(challenge)}</Markdown>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-2 @min-[680px]:flex-row @min-[680px]:items-baseline @min-[680px]:justify-between @min-[680px]:gap-2">
      <dt className="text-metadata font-medium tracking-wide text-muted">
        {label}
      </dt>
      <dd className="min-w-0 text-metadata font-medium tabular-nums @min-[680px]:text-right">
        {children}
      </dd>
    </div>
  );
}
