import { LoadingRegion, Skeleton } from "@/shared/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { dateGroup } from "@/shared/lib/date-groups";
import { BookOpen } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router";
import type { Challenge } from "@/shared/types/api";
import {
  formatBuildDifficulty,
  formatBuildScope,
  formatDate,
  formatDurationEstimate,
} from "@/features/challenges/lib/challenge-formatters";

export function ChallengeTable({
  challenges,
  chronological = true,
}: {
  challenges: Challenge[];
  chronological?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <Table aria-label="Challenges">
        <ChallengeTableHeader />
        <TableBody>
          {challenges.map((challenge, index) => {
            const group = dateGroup(challenge.createdAt);
            const scope = formatBuildScope(challenge.scope);
            const difficulty = formatBuildDifficulty(challenge.difficulty);
            const duration = formatDurationEstimate(challenge.durationEstimate);
            const status =
              challenge.status === "completed" && challenge.completedAt
                ? `Completed ${formatDate(challenge.completedAt)}`
                : challenge.status === "paused"
                  ? "Paused"
                  : challenge.status === "stopped"
                    ? "Stopped"
                    : null;

            return (
              <Fragment key={challenge.id}>
                {chronological &&
                  (index === 0 ||
                    group !== dateGroup(challenges[index - 1]!.createdAt)) && (
                    <TableRow className="border-line bg-canvas hover:bg-canvas">
                      <TableCell
                        colSpan={4}
                        className="py-2 text-metadata font-medium text-muted sm:px-4"
                      >
                        {group}
                      </TableCell>
                    </TableRow>
                  )}
                <TableRow className="border-line">
                  <TableCell className="p-0 whitespace-normal">
                    <Link
                      to={`/chat?id=${encodeURIComponent(challenge.id)}`}
                      className="flex items-center gap-3 px-3 py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground sm:px-4"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--ember-surface)] text-[var(--ember)]">
                        <BookOpen size={15} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <span className="font-medium">
                          <span className="mr-2 font-normal tabular-nums text-muted">
                            #{challenge.number}
                          </span>
                          {challenge.title}
                        </span>
                        <span className="mt-0.5 block text-metadata text-muted sm:hidden">
                          {scope} · {difficulty} · {duration}
                        </span>
                        {status && (
                          <span className="mt-0.5 block text-metadata text-muted">
                            {status}
                          </span>
                        )}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-metadata text-muted sm:table-cell">
                    {scope}
                  </TableCell>
                  <TableCell
                    className="hidden text-metadata sm:table-cell"
                    data-difficulty={challenge.difficulty}
                  >
                    {difficulty}
                  </TableCell>
                  <TableCell className="hidden text-metadata tabular-nums text-muted sm:table-cell sm:pr-4">
                    {duration}
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ChallengeTableHeader() {
  return (
    <TableHeader className="bg-panel">
      <TableRow className="border-line">
        <TableHead scope="col" className="w-full sm:px-4">
          Challenge
        </TableHead>
        <TableHead scope="col" className="hidden sm:table-cell">
          Scope
        </TableHead>
        <TableHead scope="col" className="hidden sm:table-cell">
          Difficulty
        </TableHead>
        <TableHead scope="col" className="hidden sm:table-cell sm:pr-4">
          Est. time
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

export function ChallengeTableSkeleton({
  chronological = true,
}: {
  chronological?: boolean;
}) {
  return (
    <LoadingRegion
      label="Loading challenges"
      layout="challenges"
      className="overflow-hidden rounded-lg border border-line"
    >
      <Table aria-hidden="true">
        <ChallengeTableHeader />
        <TableBody>
          {chronological && (
            <TableRow className="border-line bg-canvas">
              <TableCell colSpan={4} className="py-2 sm:px-4">
                <Skeleton className="h-3 w-16" />
              </TableCell>
            </TableRow>
          )}
          {[0, 1, 2, 3].map((row) => (
            <TableRow key={row} className="border-line">
              <TableCell className="w-full p-0">
                <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  <Skeleton className="size-8 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Skeleton className={row % 2 ? "h-4 w-3/5" : "h-4 w-4/5"} />
                    <Skeleton className="h-3 w-1/3 sm:hidden" />
                  </div>
                </div>
              </TableCell>
              {[0, 1, 2].map((column) => (
                <TableCell key={column} className="hidden sm:table-cell">
                  <Skeleton className="h-3.5 w-16" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </LoadingRegion>
  );
}
