import { Fragment, type ReactNode } from "react";
import { HistoryPicker } from "@/shared/components/history/history-picker";
import { ArrowDown, LoaderCircle } from "lucide-react";
import type { HarnessThreadSummary } from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ActivitySkeleton } from "@/shared/components/ui/loading-layouts";
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
    <p className="py-3 text-supporting text-muted">
      {activityCategoryMeta[category].empty}
    </p>
  );
}

export function HarnessActivity({
  profileId,
  challengeId,
  prelude,
  projectFilesOpen,
  inspectorContainer,
  onInspectorModalChange,
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
  projectFilesOpen?: boolean;
  inspectorContainer?: HTMLElement | null;
  onInspectorModalChange?: (modal: boolean) => void;
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
        <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
          <ActivitySkeleton trajectory={view === "trajectory"} />
        </div>
      </section>
    );
  }
  if (threads.error) {
    return (
      <section
        aria-label="Activity"
        className="mx-auto w-full max-w-[1152px] px-4 pt-2 pb-3 sm:px-6"
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
        <div className="mx-auto flex w-full max-w-[1152px] shrink-0 flex-wrap items-center justify-between gap-2 px-4 pb-2 sm:px-6">
          <div className="scrollbar-quiet min-w-0 overflow-x-auto">
            <TabsList
              className="h-8 min-w-max justify-start gap-0.5 bg-transparent p-0"
              aria-label="Activity categories"
            >
              {groups.map((entry) => (
                <TabsTrigger
                  key={entry.key}
                  value={entry.key}
                  className="flex-none px-2.5 text-supporting data-[state=active]:bg-elevated data-[state=active]:shadow-none"
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
            <Select
              value={view}
              onValueChange={(value) => onSelectView(value as ActivityView)}
            >
              <SelectTrigger
                size="sm"
                aria-label="Activity view"
                className="shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="transcript">Transcript</SelectItem>
                <SelectItem value="trajectory">Trajectory</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <TabsContent
          value={activeCategory}
          className="flex min-h-0 flex-1 flex-col"
        >
          {view === "trajectory" ? (
            activeThread ? (
              activeTranscript?.isPending ? (
                <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
                  <ActivitySkeleton header={false} trajectory />
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
                <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[1152px] flex-1 px-4 sm:px-6">
                  <HarnessTrajectoryContent
                    key={activeTranscript.data.thread.id}
                    profileId={profileId}
                    detail={activeTranscript.data}
                    projectFilesOpen={projectFilesOpen}
                    inspectorContainer={inspectorContainer}
                    onInspectorModalChange={onInspectorModalChange}
                    className="min-h-0 flex-1"
                  />
                </div>
              ) : (
                <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
                  <EmptyActivity category={activeCategory} />
                </div>
              )
            ) : (
              <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
                <EmptyActivity category={activeCategory} />
              </div>
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
                className="mx-auto w-full max-w-[1152px] px-4 pt-2 pb-3 sm:px-6"
              >
                {visibleThreads.length ? (
                  <div className="space-y-3">
                    {transcripts.map((query, index) => (
                      <Fragment key={visibleThreads[index]!.id}>
                        {index === preludeIndex && prelude && (
                          <div className="mb-3">{prelude}</div>
                        )}
                        {query.isPending ? (
                          <ActivitySkeleton header={false} />
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
                      <div className="mb-3">{prelude}</div>
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
