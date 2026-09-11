"use client";
import Link from "next/link";
import { History } from "lucide-react";
import type { Challenge } from "../../../shared/types/api";
import { buildMetadata } from "../../challenges/lib/challenge-formatters";
import { Button, buttonStyles } from "../../../shared/components/ui/button";
import { HistoryFilters } from "./history-filters";
import { HistoryRow } from "./history-row";

export function HistoryList({
  challenges,
  search,
  setSearch,
  scope,
  setScope,
}: {
  challenges: Challenge[];
  search: string;
  setSearch: (value: string) => void;
  scope: string;
  setScope: (value: string) => void;
}) {
  const filtered = challenges.filter((challenge) => {
    const matchesScope =
      scope === "all" ||
      challenge.scope === scope ||
      (scope === "legacy" && challenge.scope === null);
    const terms = [
      challenge.title,
      ...buildMetadata(challenge).map((item) => item.value),
    ]
      .join(" ")
      .toLowerCase();
    return matchesScope && terms.includes(search.trim().toLowerCase());
  });

  return (
    <main className="page max-w-[1100px]">
      <header className="mb-8 flex items-end justify-between">
        <h1 className="page-title">History</h1>
        <span className="text-xs text-muted">
          {challenges.length} completed
        </span>
      </header>
      {challenges.length ? (
        <>
          <HistoryFilters
            search={search}
            setSearch={setSearch}
            scope={scope}
            setScope={setScope}
          />
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(220px,320px)_130px_24px] gap-4 border-b border-line bg-canvas px-5 py-3 text-xs text-muted md:grid">
              <span>Build</span>
              <span>Details</span>
              <span>Completed</span>
              <span />
            </div>
            {filtered.length ? (
              filtered.map((challenge) => (
                <HistoryRow key={challenge.id} challenge={challenge} />
              ))
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-muted">
                  No builds match your search.
                </p>
                <Button
                  variant="ghost"
                  className="mt-3"
                  onClick={() => {
                    setSearch("");
                    setScope("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-line p-8 md:py-14">
          <History size={22} className="mb-4 text-muted" />
          <h2 className="text-base font-medium">No completed builds yet</h2>
          <p className="mt-2 text-sm text-muted">
            Complete a build to keep its statement and discussion here.
          </p>
          <Link
            href="/exercises"
            className={buttonStyles("secondary") + " mt-5"}
          >
            Back to builds
          </Link>
        </div>
      )}
    </main>
  );
}
