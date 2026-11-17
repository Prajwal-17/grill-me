import type { ReactNode } from "react";
import { HistoryPicker } from "@/shared/components/history/history-picker";
import { ArrowDown, History, LoaderCircle } from "lucide-react";
import type { HarnessThreadSummary } from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { cn } from "@/shared/lib/cn";
import { useHarnessThreads, useHarnessTranscripts } from "../hooks/use-harness";
import { useFollowActivity } from "../hooks/use-follow-activity";
import {
  activityCategory,
  activityCategoryMeta,
  activitySessionNumber,
  groupActivityThreads,
  isVisibleActivityKind,
  type ActivityCategory,
} from "../lib/activity";
import { isActiveThreadStatus } from "../lib/status";
import {
  formatRunDate,
  HarnessStatus,
  HarnessTranscriptContent,
} from "./harness-transcript";

function SessionSwitcher({
  label,
  threads,
  activeId,
  onSelect,
}: {
  label: string;
  threads: HarnessThreadSummary[];
  activeId: string | undefined;
  onSelect: (thread: HarnessThreadSummary) => void;
}) {
  if (threads.length < 2) return null;
  return (
    <HistoryPicker
      label={`${label} history`}
      value={activeId ?? threads[0]!.id}
      entries={threads.map((thread, index) => ({
        id: thread.id,
        label: activitySessionNumber(index, threads.length, thread.kind),
        detail: (
          <>
            <span>{formatRunDate(thread.createdAt)}</span>
            <HarnessStatus status={thread.status} label />
          </>
        ),
      }))}
      onSelect={(id) => {
        const thread = threads.find((entry) => entry.id === id);
        if (thread) onSelect(thread);
      }}
    />
  );
}

function EmptyActivity({ category }: { category: ActivityCategory }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
      <History size={18} className="text-muted" aria-hidden="true" />
      <p className="mt-2 text-ui font-medium">
        {activityCategoryMeta[category].label}
      </p>
      <p className="mt-1 max-w-xs text-supporting text-muted">
        {activityCategoryMeta[category].empty}
      </p>
    </div>
  );
}

export function HarnessActivity({
  profileId,
  challengeId,
  prelude,
  selectedRunId,
  category,
  onSelectRun,
  onSelectCategory,
}: {
  profileId: string;
  challengeId: string;
  prelude?: ReactNode;
  selectedRunId?: string;
  category: ActivityCategory;
  onSelectRun: (thread: HarnessThreadSummary) => void;
  onSelectCategory: (category: ActivityCategory) => void;
}) {
  const threads = useHarnessThreads(profileId, { challengeId, limit: 1_000 });
  const items = (threads.data ?? []).filter((thread) =>
    isVisibleActivityKind(thread.kind),
  );
  const groups = groupActivityThreads(items);
  const requested = selectedRunId
    ? items.find((thread) => thread.id === selectedRunId)
    : undefined;
  const activeCategory = requested
    ? activityCategory(requested.kind)
    : category;
  const group = groups.find((entry) => entry.key === activeCategory);
  const categoryThreads = group?.threads ?? [];
  const activeId =
    (selectedRunId &&
    categoryThreads.some((thread) => thread.id === selectedRunId)
      ? selectedRunId
      : undefined) ?? categoryThreads[0]?.id;
  const activeThread = categoryThreads.find((thread) => thread.id === activeId);
  const preparation = activeCategory === "preparation";
  // Old versions could save several setup threads. Read them chronologically
  // as one conversation while preserving every stored row and identifier.
  const visibleThreads = preparation
    ? [...categoryThreads].reverse()
    : activeThread
      ? [activeThread]
      : [];
  const transcripts = useHarnessTranscripts(
    profileId,
    visibleThreads.map((thread) => thread.id),
  );
  const runActive = visibleThreads.some((thread) =>
    isActiveThreadStatus(thread.status),
  );
  const {
    paneRef,
    contentRef,
    following,
    onScroll,
    onWheel,
    onPointerDown,
    onKeyDown,
    onTouchStart,
    jumpToLatest,
  } = useFollowActivity({
    active: runActive,
    ready:
      !threads.isPending &&
      !threads.error &&
      visibleThreads.length > 0 &&
      transcripts.every((query) => !query.isPending),
    resetKey: `${profileId}:${challengeId}:${preparation ? "preparation" : `${activeCategory}:${activeId ?? ""}`}`,
  });

  if (threads.isPending) {
    return (
      <section aria-label="Activity" className="min-h-0 flex-1 overflow-hidden">
        <div
          role="status"
          aria-label="Loading activity"
          className="mx-auto w-full max-w-[980px] space-y-3 px-4 py-4 md:px-6 md:py-5"
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </section>
    );
  }
  if (threads.error) {
    return (
      <section
        aria-label="Activity"
        className="mx-auto w-full max-w-[980px] px-4 py-4 md:px-6 md:py-5"
      >
        <p role="alert" className="text-supporting text-destructive">
          {threads.error.message}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => void threads.refetch()}
        >
          <LoaderCircle
            size={13}
            className={cn(threads.isFetching && "animate-spin")}
          />
          Retry
        </Button>
      </section>
    );
  }
  return (
    <section
      aria-label="Activity"
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <Tabs
        value={activeCategory}
        onValueChange={(value) => onSelectCategory(value as ActivityCategory)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-2 md:px-5">
          <div className="scrollbar-quiet min-w-0 overflow-x-auto">
            <TabsList
              variant="line"
              className="h-10 min-w-max justify-start"
              aria-label="Activity categories"
            >
              {groups.map((entry) => (
                <TabsTrigger
                  key={entry.key}
                  value={entry.key}
                  className="flex-none px-2.5 text-metadata"
                >
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {!preparation && (
            <SessionSwitcher
              label={group?.label ?? activityCategoryMeta[activeCategory].label}
              threads={categoryThreads}
              activeId={activeId}
              onSelect={onSelectRun}
            />
          )}
        </div>
        <TabsContent
          value={activeCategory}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            ref={paneRef}
            onScroll={onScroll}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onTouchStart={onTouchStart}
            tabIndex={0}
            aria-label="Activity messages"
            className="scrollbar-visible min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div
              ref={contentRef}
              className="mx-auto w-full max-w-[980px] px-4 py-4 md:px-6 md:py-5"
            >
              {activeCategory === "preparation" && prelude && (
                <div className="mb-4">{prelude}</div>
              )}
              {visibleThreads.length ? (
                <div className="space-y-3">
                  {transcripts.map((query, index) => (
                    <div key={visibleThreads[index]!.id}>
                      {query.isPending ? (
                        <Skeleton
                          role="status"
                          aria-label="Loading activity messages"
                          className="h-20 w-full"
                        />
                      ) : query.error ? (
                        <div className="space-y-2">
                          <p
                            role="alert"
                            className="text-supporting text-destructive"
                          >
                            {query.error.message}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void query.refetch()}
                          >
                            Retry loading messages
                          </Button>
                        </div>
                      ) : query.data ? (
                        <HarnessTranscriptContent
                          profileId={profileId}
                          detail={query.data}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyActivity category={activeCategory} />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {runActive && !following && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto h-11 md:h-8"
            onClick={jumpToLatest}
          >
            <ArrowDown size={13} aria-hidden="true" />
            Jump to latest
          </Button>
        </div>
      )}
    </section>
  );
}
