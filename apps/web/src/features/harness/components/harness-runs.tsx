import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { History } from "lucide-react";
import type { HarnessThreadSummary } from "@repo/backend/shared/contracts";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/cn";
import { useHarnessThreads } from "../hooks/use-harness";
import { runKindMeta } from "../lib/run-kinds";
import {
  formatRunDate,
  HarnessStatus,
  HarnessTranscript,
} from "./harness-transcript";

const activeStatuses = new Set(["queued", "running", "waiting"]);

const runTime = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatRunTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : runTime.format(date);
}

function RunButton({
  run,
  active,
  onSelect,
}: {
  run: HarnessThreadSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const { label, icon: Icon } = runKindMeta(run.kind);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "bg-elevated text-foreground"
          : "text-muted hover:bg-elevated/50 hover:text-foreground",
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-ui leading-5">
            {label}
          </span>
          <span className="shrink-0 text-metadata tabular-nums text-muted">
            {formatRunDate(run.createdAt)}
          </span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
          {run.status !== "completed" && <HarnessStatus status={run.status} />}
          <span className="min-w-0 truncate text-metadata text-muted">
            {run.title}
          </span>
        </span>
      </span>
    </button>
  );
}

function RunChip({
  run,
  active,
  onSelect,
}: {
  run: HarnessThreadSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const { label, icon: Icon } = runKindMeta(run.kind);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      aria-label={`${label} ${formatRunDate(run.createdAt)}`}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-metadata transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        active
          ? "border-line bg-elevated text-foreground"
          : "border-line/70 text-muted hover:bg-elevated/50 hover:text-foreground",
      )}
    >
      <Icon size={13} aria-hidden="true" />
      <span>{label}</span>
      <span className="text-muted">{formatRunTime(run.createdAt)}</span>
      {run.status !== "completed" && <HarnessStatus status={run.status} />}
    </button>
  );
}

export function HarnessRunsWorkspace({
  profileId,
  challengeId,
  prelude,
}: {
  profileId: string;
  challengeId: string;
  prelude?: ReactNode;
}) {
  const threads = useHarnessThreads(profileId, { challengeId, limit: 50 });
  const [params, setParams] = useSearchParams();
  const pane = useRef<HTMLDivElement>(null);
  const items = [...(threads.data ?? [])].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const requested = params.get("run");
  const activeId =
    (requested && items.some((thread) => thread.id === requested)
      ? requested
      : undefined) ??
    items.find((thread) => activeStatuses.has(thread.status))?.id ??
    items[0]?.id;
  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
  }, [activeId]);
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("run", id);
    setParams(next, { replace: true });
  };
  if (threads.isPending)
    return (
      <div className="mx-auto flex w-full max-w-[1180px] gap-6">
        <div className="hidden w-[256px] shrink-0 space-y-2 lg:block">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    );
  if (threads.error)
    return (
      <p role="alert" className="text-supporting text-destructive">
        {threads.error.message}
      </p>
    );
  if (!items.length)
    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1180px] flex-col gap-4">
        {prelude}
        <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center rounded-lg border border-line bg-surface/40 px-6 py-12 text-center">
          <History size={20} className="text-muted" aria-hidden="true" />
          <p className="mt-2 text-ui font-medium">No agent runs yet</p>
          <p className="mt-1 max-w-sm text-supporting text-muted">
            Project preparation, discussions, and hints record their full
            transcript here.
          </p>
        </div>
      </div>
    );
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1180px] flex-col gap-4 lg:flex-row lg:gap-6">
      <aside
        aria-label="Agent runs"
        className="flex min-h-0 shrink-0 flex-col lg:w-[256px]"
      >
        <div className="hidden items-center justify-between border-b border-line pb-2 lg:flex">
          <h2 className="text-ui font-medium">Runs</h2>
          <span className="text-metadata tabular-nums text-muted">
            {items.length}
          </span>
        </div>
        <ul className="scrollbar-quiet hidden min-h-0 flex-1 space-y-0.5 overflow-y-auto py-2 lg:block">
          {items.map((run) => (
            <li key={run.id}>
              <RunButton
                run={run}
                active={run.id === activeId}
                onSelect={() => select(run.id)}
              />
            </li>
          ))}
        </ul>
        <div className="scrollbar-quiet -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden">
          {items.map((run) => (
            <RunChip
              key={run.id}
              run={run}
              active={run.id === activeId}
              onSelect={() => select(run.id)}
            />
          ))}
        </div>
      </aside>
      <div
        ref={pane}
        className="scrollbar-quiet min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-6 lg:pr-1"
      >
        {prelude && <div className="mb-4">{prelude}</div>}
        {activeId && (
          <HarnessTranscript
            key={activeId}
            profileId={profileId}
            threadId={activeId}
          />
        )}
      </div>
    </div>
  );
}
