"use client";
import type { ReactNode } from "react";
import { Blocks, Network, Target } from "lucide-react";
import { cn } from "../../../shared/lib/cn";
import type { Challenge } from "../../../shared/types/api";
import { Markdown } from "../../../shared/components/markdown";
import { statementBody } from "../lib/challenge-statement";
import { ChallengeMetadata } from "./challenge-metadata";

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
    challenge.scope === "system"
      ? Network
      : challenge.scope === "feature"
        ? Blocks
        : Target;
  return (
    <article className={cn("mx-auto w-full min-w-0 max-w-[76ch]", className)}>
      <header className="mb-6 border-b border-line pb-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon size={14} className="shrink-0 text-muted" />
            <ChallengeMetadata challenge={challenge} />
          </div>
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
