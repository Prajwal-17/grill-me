import { useEffect, useRef, type ReactNode } from "react";
import { History, LoaderCircle } from "lucide-react";
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
import { useHarnessThreads } from "../hooks/use-harness";
import {
  activityCategory,
  activityCategoryMeta,
  activitySessionNumber,
  groupActivityThreads,
  type ActivityCategory,
} from "../lib/activity";
import {
  formatRunDate,
  HarnessStatus,
  HarnessTranscript,
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
    <div
      role="group"
      aria-label={`${label} sessions`}
      className="mb-4 flex min-w-0 items-center gap-2 border-b border-line pb-3"
    >
      <span className="shrink-0 text-metadata text-muted">Sessions</span>
      <ul className="scrollbar-quiet flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {threads.map((thread, index) => (
          <li key={thread.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(thread)}
              aria-current={thread.id === activeId ? "true" : undefined}
              aria-label={`${activitySessionNumber(index, threads.length)}, ${formatRunDate(thread.createdAt)}`}
              title={thread.title}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 text-metadata transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-8",
                thread.id === activeId
                  ? "border-line bg-elevated text-foreground"
                  : "border-line/70 text-muted hover:bg-elevated/50 hover:text-foreground",
              )}
            >
              <span className="tabular-nums">
                {activitySessionNumber(index, threads.length)}
              </span>
              <span className="text-muted">
                {formatRunDate(thread.createdAt)}
              </span>
              <HarnessStatus status={thread.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
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
  const pane = useRef<HTMLDivElement>(null);
  const items = threads.data ?? [];
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

  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
  }, [activeId, activeCategory]);

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
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <Tabs
        value={activeCategory}
        onValueChange={(value) => onSelectCategory(value as ActivityCategory)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="shrink-0 border-b border-line px-2 md:px-5">
          <div className="scrollbar-quiet overflow-x-auto">
            <TabsList
              variant="line"
              className="h-10 min-w-max justify-start"
              aria-label="Activity categories"
            >
              {groups.map((entry) => (
                <TabsTrigger
                  key={entry.key}
                  value={entry.key}
                  className="flex-none gap-1.5 px-2 text-metadata"
                >
                  {entry.label}
                  <span className="tabular-nums text-muted">
                    {entry.threads.length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <TabsContent
          value={activeCategory}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            ref={pane}
            className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="mx-auto w-full max-w-[980px] px-4 py-4 md:px-6 md:py-5">
              {activeCategory === "preparation" && prelude && (
                <div className="mb-4">{prelude}</div>
              )}
              <SessionSwitcher
                label={
                  group?.label ?? activityCategoryMeta[activeCategory].label
                }
                threads={categoryThreads}
                activeId={activeId}
                onSelect={onSelectRun}
              />
              {activeId ? (
                <HarnessTranscript
                  key={activeId}
                  profileId={profileId}
                  threadId={activeId}
                />
              ) : (
                <EmptyActivity category={activeCategory} />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
