import { Fragment, type ReactNode } from "react";
import { HistoryPicker } from "@/shared/components/history/history-picker";
import {
  Activity,
  ArrowDown,
  History,
  LoaderCircle,
  MessageSquare,
} from "lucide-react";
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
  type ActivityView,
} from "../lib/activity";
import { isActiveThreadStatus } from "../lib/status";
import {
  formatRunDate,
  HarnessStatus,
  HarnessTranscriptContent,
} from "./harness-transcript";
import { HarnessTrajectoryContent } from "./trajectory-view";

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
  view,
  onSelectRun,
  onSelectCategory,
  onSelectView,
}: {
  profileId: string;
  challengeId: string;
  prelude?: ReactNode;
  selectedRunId?: string;
  category: ActivityCategory;
  view: ActivityView;
  onSelectRun: (thread: HarnessThreadSummary) => void;
  onSelectCategory: (category: ActivityCategory) => void;
  onSelectView: (view: ActivityView) => void;
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
  // Build reads generation and preparation chronologically as one flow while
  // preserving every stored row and identifier.
  const merged = activeCategory === "build";
  const visibleThreads = merged
    ? [...categoryThreads].reverse()
    : activeThread
      ? [activeThread]
      : [];
  const transcripts = useHarnessTranscripts(
    profileId,
    visibleThreads.map((thread) => thread.id),
  );
  // The preparation actions sit where the setup phase starts: after the
  // generation run, or at the end of the flow when no preparation exists yet.
  const scaffoldIndex = visibleThreads.findIndex(
    (thread) => thread.kind === "project_scaffold",
  );
  const preludeIndex =
    merged && prelude
      ? scaffoldIndex === -1
        ? visibleThreads.length
        : scaffoldIndex
      : -1;
  const activeIndex = activeThread
    ? visibleThreads.findIndex((thread) => thread.id === activeThread.id)
    : -1;
  const activeTranscript =
    activeIndex >= 0 ? transcripts[activeIndex] : undefined;
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
    resetKey: `${profileId}:${challengeId}:${merged ? "build" : `${activeCategory}:${activeId ?? ""}`}`,
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
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-clip"
    >
      <Tabs
        value={activeCategory}
        onValueChange={(value) => onSelectCategory(value as ActivityCategory)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-2 md:px-5">
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
          <div className="flex shrink-0 items-center gap-1.5">
            {(!merged || view === "trajectory") && (
              <SessionSwitcher
                label={
                  group?.label ?? activityCategoryMeta[activeCategory].label
                }
                threads={categoryThreads}
                activeId={activeId}
                onSelect={onSelectRun}
              />
            )}
            <div
              role="group"
              aria-label="Activity view"
              className="flex items-center rounded-md border border-line bg-surface p-0.5"
            >
              <Button
                size="sm"
                variant={view === "transcript" ? "secondary" : "ghost"}
                aria-pressed={view === "transcript"}
                onClick={() => onSelectView("transcript")}
              >
                <MessageSquare size={12} aria-hidden="true" />
                Transcript
              </Button>
              <Button
                size="sm"
                variant={view === "trajectory" ? "secondary" : "ghost"}
                aria-pressed={view === "trajectory"}
                onClick={() => onSelectView("trajectory")}
              >
                <Activity size={12} aria-hidden="true" />
                Trajectory
              </Button>
            </div>
          </div>
        </div>
        <TabsContent
          value={activeCategory}
          className="flex min-h-0 flex-1 flex-col"
        >
          {view === "trajectory" ? (
            activeThread ? (
              activeTranscript?.isPending ? (
                <div
                  role="status"
                  aria-label="Loading activity trajectory"
                  className="space-y-3 p-4"
                >
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : activeTranscript?.error ? (
                <div className="space-y-2 p-4">
                  <p role="alert" className="text-supporting text-destructive">
                    {activeTranscript.error.message}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void activeTranscript.refetch()}
                  >
                    Retry loading trajectory
                  </Button>
                </div>
              ) : activeTranscript?.data ? (
                <HarnessTrajectoryContent
                  key={activeTranscript.data.thread.id}
                  profileId={profileId}
                  detail={activeTranscript.data}
                  className="min-h-0 flex-1"
                />
              ) : (
                <EmptyActivity category={activeCategory} />
              )
            ) : (
              <EmptyActivity category={activeCategory} />
            )
          ) : (
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
                {visibleThreads.length ? (
                  <div className="space-y-3">
                    {transcripts.map((query, index) => (
                      <Fragment key={visibleThreads[index]!.id}>
                        {index === preludeIndex && prelude && (
                          <div className="mb-4">{prelude}</div>
                        )}
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
                            joined={merged}
                          />
                        ) : null}
                      </Fragment>
                    ))}
                    {preludeIndex === visibleThreads.length && prelude && (
                      <div>{prelude}</div>
                    )}
                  </div>
                ) : (
                  <>
                    {preludeIndex === 0 && prelude && (
                      <div className="mb-4">{prelude}</div>
                    )}
                    <EmptyActivity category={activeCategory} />
                  </>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {view === "transcript" && runActive && !following && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto h-11 rounded-full shadow-[0_4px_12px_-2px_rgba(0,0,0,0.30)] md:h-8"
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
