import type { ReactNode } from "react";
import { Blocks, Network, Target } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { Challenge } from "@/shared/types/api";
import { Markdown } from "@/shared/components/markdown";
import { statementBody } from "@/features/challenges/lib/challenge-statement";
import { ChallengeMetadata } from "@/features/challenges/components/challenge-metadata";

export function ChallengeCard({
  challenge,
  className,
  headingPrefix,
  headerAction,
  showTitle = true,
}: {
  challenge: Challenge;
  className?: string;
  headingPrefix?: string;
  headerAction?: ReactNode;
  showTitle?: boolean;
}) {
  const Icon =
    challenge.scope === "system"
      ? Network
      : challenge.scope === "feature"
        ? Blocks
        : Target;
  return (
    <article className={cn("mx-auto w-full min-w-0 max-w-[70ch]", className)}>
      <header className="mb-6 border-b border-line pb-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon size={14} className="shrink-0 text-muted" />
            <ChallengeMetadata challenge={challenge} />
          </div>
          {headerAction}
        </div>
        {showTitle && (
          <h1 className="text-title font-semibold leading-tight tracking-[-0.02em]">
            <span className="mr-2 font-normal text-muted">
              #{challenge.number}
            </span>
            {challenge.title}
          </h1>
        )}
      </header>
      <div className="text-reading [overflow-wrap:anywhere]">
        <Markdown headingPrefix={headingPrefix}>
          {statementBody(challenge)}
        </Markdown>
      </div>
    </article>
  );
}
