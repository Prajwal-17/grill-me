"use client";
import { TopicProgressView } from "./topic-progress";
import Link from "next/link";
import { History } from "lucide-react";
import type { Challenge } from "@/shared/types/api";
import { buildMetadata } from "@/features/challenges/lib/challenge-formatters";
import { Button, buttonStyles } from "@/shared/components/ui/button";
import {
  HistoryFilters,
  type HistoryScope,
} from "@/features/history/components/history-filters";
import { HistoryRow } from "@/features/history/components/history-row";

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
  const filtered = challenges.filter((challenge) => {
    const matchesScope = scope === "all" || challenge.scope === scope;
    const terms = [
      `#${challenge.number}`,
      challenge.title,
      ...buildMetadata(challenge).map((item) => item.value),
    ]
      .join(" ")
      .toLowerCase();
    return matchesScope && terms.includes(search.trim().toLowerCase());
  });

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-12 pt-7 md:px-10 md:pb-16 md:pt-8">
        <div className="mx-auto w-full max-w-[1100px]">
          <TopicProgressView profileId={profileId} />
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
                href="/challenges"
                className={buttonStyles("secondary") + " mt-5"}
              >
                Back to challenges
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
