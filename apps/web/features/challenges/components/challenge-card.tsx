"use client";
import type { ReactNode } from "react";
import { Code2, MessageSquare, Network, Blocks } from "lucide-react";
import { cn } from "../../../shared/lib/cn";
import type { Challenge } from "../../../shared/types/api";
import { Markdown } from "../../../shared/components/markdown";
import { formatChallengeType } from "../lib/challenge-formatters";
import { statementBody } from "../lib/challenge-statement";
export function ChallengeCard({
  challenge,
  className,
  headingPrefix,
  headerAction,
}: {
  challenge: Challenge;
  className?: string;
  headingPrefix?: string;
  headerAction?: ReactNode;
}) {
  const Icon =
    challenge.type === "question"
      ? MessageSquare
      : challenge.type === "architecture"
        ? Network
        : challenge.type === "mini-project"
          ? Blocks
          : Code2;
  return (
    <article className={cn("mx-auto w-full min-w-0 max-w-[76ch]", className)}>
      <header className="mb-6 border-b border-line pb-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-xs text-muted">
            <Icon size={13} />
            {formatChallengeType(challenge.type)}
          </p>
          {headerAction}
        </div>
        <h1 className="page-title leading-tight">{challenge.title}</h1>
      </header>
      <div className="reading">
        <Markdown headingPrefix={headingPrefix}>
          {statementBody(challenge)}
        </Markdown>
      </div>
    </article>
  );
}
