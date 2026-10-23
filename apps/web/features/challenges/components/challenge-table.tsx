import { ArrowUpRight, Blocks, Network, Target } from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import type { Challenge } from "@/shared/types/api";
import { formatDate } from "@/features/challenges/lib/challenge-formatters";
import { ChallengeMetadata } from "./challenge-metadata";
import styles from "./challenge-table.module.css";

export function ChallengeTable({ challenges }: { challenges: Challenge[] }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-line",
        styles.table,
      )}
    >
      <div
        className={cn(
          "border-b border-line bg-panel px-4 py-3 text-[11px] text-muted",
          styles.header,
        )}
        aria-hidden="true"
      >
        <span>Challenge</span>
        <span>Type</span>
        <span>Difficulty</span>
        <span>Est. time</span>
        <span />
      </div>
      <ul>
        {challenges.map((challenge) => {
          const completed = challenge.status === "completed";
          const Icon =
            challenge.scope === "system"
              ? Network
              : challenge.scope === "feature"
                ? Blocks
                : Target;
          return (
            <li
              key={challenge.id}
              className="border-b border-line last:border-b-0"
            >
              <Link
                href={
                  completed
                    ? "/history?id=" + challenge.id
                    : "/chat?id=" + challenge.id
                }
                className={cn(
                  "group px-4 py-4 outline-offset-[-3px] transition-colors hover:bg-panel",
                  styles.row,
                )}
              >
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-2",
                    styles.title,
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.5}
                    className="shrink-0 text-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <h3 className="text-sm font-medium leading-5">
                      <span className="mr-2 font-normal text-muted">
                        #{challenge.number}
                      </span>
                      {challenge.title}
                      {(challenge.status === "paused" ||
                        challenge.status === "stopped") && (
                        <span className="ml-2 inline-block rounded-md bg-canvas px-1.5 text-[11px] font-normal text-muted">
                          {challenge.status === "paused" ? "Paused" : "Stopped"}
                        </span>
                      )}
                    </h3>
                    {completed && challenge.completedAt && (
                      <p className="text-[11px] text-muted">
                        Completed {formatDate(challenge.completedAt)}
                      </p>
                    )}
                  </div>
                </div>
                <ChallengeMetadata
                  challenge={challenge}
                  compact
                  variant="columns"
                  className={styles.metadata}
                />
                <ArrowUpRight
                  size={15}
                  className={cn(
                    "text-muted group-hover:text-foreground",
                    styles.arrow,
                  )}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
