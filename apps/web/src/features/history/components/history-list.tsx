import { TopicProgressView } from "./topic-progress";
import { useState } from "react";
import { Link } from "react-router";
import { History } from "lucide-react";
import type { Challenge } from "@/shared/types/api";
import { buildMetadata } from "@/features/challenges/lib/challenge-formatters";
import { Button, buttonStyles } from "@/shared/components/ui/button";
import {
  HistoryFilters,
  type HistoryScope,
  type HistorySort,
} from "@/features/history/components/history-filters";
import { HistoryRow } from "@/features/history/components/history-row";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { CollectionSummary } from "@/shared/components/layout/collection-toolbar";

export function HistoryList({
  profileId,
  challenges,
  search,
  setSearch,
  scope,
  setScope,
}: {
  profileId: string;
  challenges: Challenge[];
  search: string;
  setSearch: (value: string) => void;
  scope: HistoryScope;
  setScope: (value: HistoryScope) => void;
}) {
  const [sort, setSort] = useState<HistorySort>("newest");
  const filtered = challenges
    .filter((challenge) => {
      const matchesScope = scope === "all" || challenge.scope === scope;
      const terms = [
        `#${challenge.number}`,
        challenge.title,
        ...buildMetadata(challenge).map((item) => item.value),
      ]
        .join(" ")
        .toLowerCase();
      return matchesScope && terms.includes(search.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const dates = (a.completedAt ?? a.createdAt).localeCompare(
        b.completedAt ?? b.createdAt,
      );
      return sort === "oldest" ? dates : -dates;
    });

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
        <div className="mx-auto w-full max-w-[1280px]">
          {challenges.length ? (
            <>
              <div className="overflow-hidden rounded-lg border border-line">
                <HistoryFilters
                  search={search}
                  setSearch={setSearch}
                  scope={scope}
                  setScope={setScope}
                  sort={sort}
                  setSort={setSort}
                />
                {filtered.length ? (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Build</TableHead>
                        <TableHead className="hidden w-[310px] md:table-cell">
                          Details
                        </TableHead>
                        <TableHead className="hidden w-[140px] sm:table-cell">
                          Completed
                        </TableHead>
                        <TableHead className="w-10">
                          <span className="sr-only">Open build</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((challenge) => (
                        <HistoryRow key={challenge.id} challenge={challenge} />
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="px-5 py-12 text-center">
                    <p className="text-ui text-muted">
                      No builds match your search.
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-3"
                      onClick={() => {
                        setSearch("");
                        setScope("all");
                        setSort("newest");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
              <CollectionSummary>
                <span>
                  {filtered.length} of {challenges.length} builds
                </span>
                <span>Completed and stopped</span>
              </CollectionSummary>
            </>
          ) : (
            <div className="rounded-xl border border-line bg-panel p-8 md:py-14">
              <History size={22} className="mb-4 text-muted" />
              <h2 className="text-base font-medium">No completed builds yet</h2>
              <Link
                to="/challenges"
                className={buttonStyles("secondary") + " mt-5"}
              >
                Back to challenges
              </Link>
            </div>
          )}
          <TopicProgressView profileId={profileId} />
        </div>
      </div>
    </main>
  );
}
