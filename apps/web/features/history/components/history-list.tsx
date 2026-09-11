"use client";
import Link from "next/link";
import { History } from "lucide-react";
import type { Challenge } from "../../../shared/types/api";
import { formatChallengeType } from "../../challenges/lib/challenge-formatters";
import { Button, buttonStyles } from "../../../shared/components/ui/button";
import { HistoryFilters } from "./history-filters";
import { HistoryRow } from "./history-row";
export function HistoryList({
  challenges,
  search,
  setSearch,
  format,
  setFormat,
}: {
  challenges: Challenge[];
  search: string;
  setSearch: (value: string) => void;
  format: string;
  setFormat: (value: string) => void;
}) {
  const filtered = challenges.filter(
    (c) =>
      (format === "all" || c.type === format) &&
      [c.title, formatChallengeType(c.type)]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
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
            format={format}
            setFormat={setFormat}
          />
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="hidden grid-cols-[minmax(0,1fr)_150px_130px_24px] gap-4 border-b border-line bg-canvas px-5 py-3 text-xs text-muted md:grid">
              <span>Exercise</span>
              <span>Format</span>
              <span>Completed</span>
              <span />
            </div>
            {filtered.length ? (
              filtered.map((c) => <HistoryRow key={c.id} challenge={c} />)
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-muted">
                  No exercises match your search.
                </p>
                <Button
                  variant="ghost"
                  className="mt-3"
                  onClick={() => {
                    setSearch("");
                    setFormat("all");
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
          <h2 className="text-base font-medium">No completed exercises yet</h2>
          <p className="mt-2 text-sm text-muted">
            Mark an exercise complete to keep its brief and discussion here.
          </p>
          <Link
            href="/exercises"
            className={buttonStyles("secondary") + " mt-5"}
          >
            Back to exercises
          </Link>
        </div>
      )}
    </main>
  );
}
