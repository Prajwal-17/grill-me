import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FilePenLine,
  FileSearch,
  FileText,
  Globe,
  Info,
  LoaderCircle,
  MessageCircleQuestion,
  MessageSquare,
  Search,
  ShieldAlert,
  Terminal,
  User,
  Wrench,
} from "lucide-react";
import type { HarnessThreadDetail } from "@repo/backend/shared/contracts";
import { AgentActivityStatus } from "@/shared/components/ai/agent-activity-status";
import { Button } from "@/shared/components/ui/button";
import { SearchField } from "@/shared/components/ui/search-field";
import { Sheet, SheetContent, SheetTitle } from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/cn";
import { useHarnessThread } from "../hooks/use-harness";
import { useFollowActivity } from "../hooks/use-follow-activity";
import { useInlineInspector } from "../hooks/use-inline-inspector";
import { activityWorkingLabel, isActiveThreadStatus } from "../lib/status";
import {
  filterTrajectoryTurns,
  formatTrajectoryDuration,
  projectTrajectory,
  type TrajectoryDetailModel,
  type TrajectoryKind,
  type TrajectoryRow,
  type TrajectoryTurnModel,
} from "../lib/trajectory";
import { formatRunDate, HarnessStatus } from "./harness-transcript";
import { TrajectoryInspector } from "./trajectory-inspector";
import { trajectoryTagClass } from "./trajectory-parts";
import { env } from "@/shared/config/env";

const kindIcons: Record<TrajectoryKind, typeof Terminal> = {
  system: Info,
  user: User,
  context: Info,
  assistant: MessageSquare,
  reasoning: Brain,
  tool: Wrench,
  result: CheckCircle2,
  request: ShieldAlert,
  notice: Info,
  error: CircleAlert,
};

const toolIcons: Record<string, typeof Terminal> = {
  command_execution: Terminal,
  file_change: FilePenLine,
  file_read: FileText,
  file_search: FileSearch,
  web_search: Globe,
};

const inspectorWidthKey = `grill-me.harness.inspector-width.${env.appEnv}`;

function clampInspectorWidth(width: number) {
  if (!Number.isFinite(width)) return 480;
  const max = Math.min(920, Math.max(480, window.innerWidth * 0.55));
  return Math.round(Math.min(Math.max(width, 320), max));
}

function readInspectorWidth() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(inspectorWidthKey) ?? "null",
    ) as { version?: unknown; width?: unknown } | null;
    if (
      saved &&
      saved.version === 1 &&
      typeof saved.width === "number" &&
      Number.isFinite(saved.width)
    )
      return clampInspectorWidth(saved.width);
  } catch {
    /* Corrupt settings fall back to the default width. */
  }
  return 480;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[2px] bg-warning/25 text-foreground">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

function durationFor(
  startedAt: number | null,
  completedAt: number | null,
  active: boolean,
  now: number,
) {
  if (startedAt === null) return null;
  if (completedAt === null && !active) return null;
  return Math.max(0, (completedAt ?? now) - startedAt);
}

function RunSummary({
  model,
  active,
  now,
}: {
  model: TrajectoryDetailModel;
  active: boolean;
  now: number;
}) {
  const { thread } = model;
  const duration = durationFor(
    model.stats.startedAt,
    model.stats.completedAt,
    active,
    now,
  );
  return (
    <header className="shrink-0 border-b border-line px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-metadata text-muted">
        <h3 className="min-w-0 max-w-full truncate text-supporting font-medium text-foreground">
          {thread.title}
        </h3>
        <HarnessStatus status={thread.status} label />
        <span aria-hidden="true">·</span>
        <span className="font-mono">{thread.model}</span>
        <span aria-hidden="true" className="hidden sm:inline">
          ·
        </span>
        <span className="hidden sm:inline">{thread.runtimeMode}</span>
        <span aria-hidden="true">·</span>
        <span>{formatRunDate(thread.createdAt)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-metadata text-muted">
        {duration !== null && (
          <span className="tabular-nums">
            {active ? "Working for" : "Worked for"}{" "}
            {formatTrajectoryDuration(duration)}
          </span>
        )}
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {model.stats.turns} turn{model.stats.turns === 1 ? "" : "s"}
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {model.stats.toolCalls} call{model.stats.toolCalls === 1 ? "" : "s"}
        </span>
        {model.stats.tokens && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {model.stats.tokens.total.toLocaleString()} tokens
            </span>
          </>
        )}
      </div>
    </header>
  );
}

function Toolbar({
  allFolded,
  onToggleAllFolded,
  showReasoning,
  onToggleReasoning,
  showContext,
  onToggleContext,
  query,
  onQueryChange,
  records,
  calls,
}: {
  allFolded: boolean;
  onToggleAllFolded: () => void;
  showReasoning: boolean;
  onToggleReasoning: () => void;
  showContext: boolean;
  onToggleContext: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  records: number;
  calls: number;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Trajectory controls"
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1.5"
    >
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={allFolded}
        title={allFolded ? "Expand every turn" : "Fold every turn"}
        onClick={onToggleAllFolded}
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={cn("transition-transform", allFolded && "rotate-90")}
        />
        Turns
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={showReasoning}
        title={showReasoning ? "Hide reasoning rows" : "Show reasoning rows"}
        onClick={onToggleReasoning}
      >
        <Brain size={13} aria-hidden="true" />
        Reasoning
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={showContext}
        title={
          showContext
            ? "Hide prompt and context rows"
            : "Show prompt and context rows"
        }
        onClick={onToggleContext}
      >
        <Info size={13} aria-hidden="true" />
        Context
      </Button>
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-metadata text-muted tabular-nums">
          {records} record{records === 1 ? "" : "s"} · {calls} call
          {calls === 1 ? "" : "s"}
        </span>
        <SearchField
          aria-label="Search records"
          placeholder="Search calls, files, output"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onClear={() => onQueryChange("")}
          className="w-40 sm:w-56"
        />
      </div>
    </div>
  );
}

function AttemptHeader({
  attempt,
}: {
  attempt: TrajectoryTurnModel["attempts"][number];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/60 bg-canvas/40 px-3 py-1 text-metadata text-muted">
      <span className="font-medium text-foreground">
        Attempt {attempt.ordinal ?? "—"}
      </span>
      <HarnessStatus status={attempt.status} label />
      <span className="tabular-nums">
        {formatTrajectoryDuration(attempt.durationMs)}
      </span>
      {attempt.error && (
        <span className="min-w-0 truncate text-destructive">
          {attempt.error}
        </span>
      )}
    </div>
  );
}

function RowButton({
  row,
  selected,
  query,
  onSelect,
  register,
}: {
  row: TrajectoryRow;
  selected: boolean;
  query: string;
  onSelect: (row: TrajectoryRow) => void;
  register: (id: string, element: HTMLButtonElement | null) => void;
}) {
  const Icon =
    row.kind === "tool"
      ? (toolIcons[row.item?.type ?? ""] ?? Wrench)
      : row.kind === "request"
        ? MessageCircleQuestion
        : kindIcons[row.kind];
  const failed = row.status === "failed" || row.tool?.isError === true;
  return (
    <button
      type="button"
      ref={(element) => register(row.id, element)}
      aria-pressed={selected}
      aria-label={`${row.tag}: ${row.summary}${row.preview ? `. ${row.preview}` : ""}`}
      onClick={() => onSelect(row)}
      className={cn(
        "group flex w-full min-w-0 items-start gap-2 border-b border-line/50 px-3 py-1.5 text-left transition-colors outline-none",
        "hover:bg-elevated/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "bg-brand-soft/60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-5 w-[82px] shrink-0 items-center justify-center rounded-sm px-1 text-metadata font-medium",
          trajectoryTagClass[row.kind],
        )}
      >
        {row.tag}
      </span>
      <Icon
        size={13}
        aria-hidden="true"
        className={cn(
          "mt-1 shrink-0",
          failed ? "text-destructive" : "text-muted",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-supporting",
            row.kind === "reasoning" ? "text-muted" : "text-foreground",
            row.tool && "font-mono",
          )}
        >
          <Highlight text={row.summary} query={query} />
        </span>
        {row.preview && (
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-metadata text-muted">
            {(row.kind === "tool" || row.kind === "result") && (
              <span aria-hidden="true">→</span>
            )}
            <span className="truncate">
              <Highlight text={row.preview} query={query} />
            </span>
          </span>
        )}
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-2 text-metadata text-muted tabular-nums">
        {row.durationMs !== null && row.kind !== "user" && (
          <span>{formatTrajectoryDuration(row.durationMs)}</span>
        )}
        {row.tokens && <span>{row.tokens.total.toLocaleString()} tok</span>}
        {row.status !== "completed" && <HarnessStatus status={row.status} />}
      </span>
    </button>
  );
}

function TurnSection({
  turn,
  folded,
  onToggle,
  selectedId,
  onSelectRow,
  query,
  active,
  now,
  register,
}: {
  turn: TrajectoryTurnModel;
  folded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelectRow: (row: TrajectoryRow) => void;
  query: string;
  active: boolean;
  now: number;
  register: (id: string, element: HTMLButtonElement | null) => void;
}) {
  const duration = durationFor(turn.startedAt, turn.completedAt, active, now);
  return (
    <section
      aria-label={`Turn ${turn.ordinal}`}
      className="border-b border-line last:border-b-0"
    >
      <button
        type="button"
        aria-expanded={!folded}
        onClick={onToggle}
        className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-left transition-colors hover:bg-elevated/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-muted transition-transform duration-150",
            !folded && "rotate-90",
          )}
        />
        <span className="text-metadata font-medium text-foreground">
          Turn {turn.ordinal}
        </span>
        <HarnessStatus status={turn.status} label />
        <span className="hidden font-mono text-metadata text-muted sm:inline">
          {turn.model}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-metadata text-muted tabular-nums">
          {turn.toolCount > 0 && (
            <span>
              {turn.toolCount} call{turn.toolCount === 1 ? "" : "s"}
            </span>
          )}
          {turn.tokens && <span>{turn.tokens.total.toLocaleString()} tok</span>}
          {duration !== null && (
            <span>{formatTrajectoryDuration(duration)}</span>
          )}
        </span>
      </button>
      {folded ? (
        <p className="px-3 py-2 text-metadata text-muted">
          {turn.rows.length} record{turn.rows.length === 1 ? "" : "s"} folded.
        </p>
      ) : (
        <div>
          {turn.attempts.map((attempt) => (
            <div key={attempt.id}>
              {turn.attempts.length > 1 && <AttemptHeader attempt={attempt} />}
              {attempt.rows.map((row) => (
                <RowButton
                  key={row.id}
                  row={row}
                  selected={selectedId === row.id}
                  query={query}
                  onSelect={onSelectRow}
                  register={register}
                />
              ))}
            </div>
          ))}
          {!turn.attempts.length && (
            <p className="px-3 py-2 text-metadata text-muted">
              No records were captured in this turn.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyLedger({
  hasFilters,
  active,
  onClear,
}: {
  hasFilters: boolean;
  active: boolean;
  onClear: () => void;
}) {
  const title = hasFilters
    ? "No records match"
    : active
      ? "Waiting for the first record"
      : "No records captured";
  const description = hasFilters
    ? "Try another search, or show reasoning and context rows again."
    : active
      ? "The run is starting; records appear as the agent works."
      : "This run finished before the trajectory recorder saw any activity.";
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
      <Search size={18} className="text-muted" aria-hidden="true" />
      <p className="mt-2 text-ui font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-supporting text-muted">{description}</p>
      {hasFilters && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

function TrajectorySkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading run trajectory"
      className="space-y-3 p-4"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function HarnessTrajectory({
  profileId,
  threadId,
  className,
}: {
  profileId: string;
  threadId: string;
  className?: string;
}) {
  const query = useHarnessThread(profileId, threadId);
  if (query.isPending)
    return (
      <div className={className}>
        <TrajectorySkeleton />
      </div>
    );
  if (query.error)
    return (
      <div className={cn("p-4", className)}>
        <p role="alert" className="text-supporting text-destructive">
          {query.error.message}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => void query.refetch()}
        >
          <LoaderCircle
            size={13}
            className={cn(query.isFetching && "animate-spin")}
          />
          Retry
        </Button>
      </div>
    );
  if (!query.data) return null;
  return (
    <HarnessTrajectoryContent
      key={query.data.thread.id}
      profileId={profileId}
      detail={query.data}
      className={className}
    />
  );
}

export function HarnessTrajectoryContent({
  profileId,
  detail,
  className,
}: {
  profileId: string;
  detail: HarnessThreadDetail;
  className?: string;
}) {
  const model = useMemo(() => projectTrajectory(detail), [detail]);
  const active = isActiveThreadStatus(detail.thread.status);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [showReasoning, setShowReasoning] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inlineInspector = useInlineInspector();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [inspectorWidth, setInspectorWidth] = useState(readInspectorWidth);
  const inspectorDrag = useRef<{
    startX: number;
    startWidth: number;
    width?: number;
  } | null>(null);

  const persistInspectorWidth = (width: number) => {
    try {
      localStorage.setItem(
        inspectorWidthKey,
        JSON.stringify({ version: 1, width }),
      );
    } catch {
      /* Storage failures keep the session width. */
    }
  };
  const onInspectorResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    inspectorDrag.current = {
      startX: event.clientX,
      startWidth: inspectorWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onInspectorResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = inspectorDrag.current;
    if (!drag) return;
    const width = clampInspectorWidth(
      drag.startWidth + (drag.startX - event.clientX),
    );
    drag.width = width;
    setInspectorWidth(width);
  };
  const endInspectorResize = () => {
    const drag = inspectorDrag.current;
    if (!drag) return;
    inspectorDrag.current = null;
    if (drag.width !== undefined) persistInspectorWidth(drag.width);
  };
  const onInspectorResizeKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 24;
    const next =
      event.key === "ArrowLeft"
        ? clampInspectorWidth(inspectorWidth - step)
        : event.key === "ArrowRight"
          ? clampInspectorWidth(inspectorWidth + step)
          : event.key === "Home"
            ? 320
            : event.key === "End"
              ? clampInspectorWidth(920)
              : null;
    if (next === null) return;
    event.preventDefault();
    setInspectorWidth(next);
    persistInspectorWidth(next);
  };
  const registerRow = (id: string, element: HTMLButtonElement | null) => {
    if (element) rowRefs.current.set(id, element);
    else rowRefs.current.delete(id);
  };

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const filtered = useMemo(
    () =>
      filterTrajectoryTurns(model.turns, {
        query: deferredQuery,
        showReasoning,
        showContext,
      }),
    [model.turns, deferredQuery, showReasoning, showContext],
  );
  const selectedRow = model.rows.find((row) => row.id === selectedId) ?? null;
  const allFolded =
    filtered.turns.length > 0 &&
    filtered.turns.every((turn) => folded.has(turn.id));
  const callCount = filtered.turns.reduce(
    (total, turn) =>
      total +
      turn.rows.filter((row) => row.kind === "tool" || row.kind === "result")
        .length,
    0,
  );
  const clearFilters = () => {
    setQuery("");
    setShowReasoning(true);
    setShowContext(true);
  };
  const {
    paneRef,
    contentRef,
    following,
    onScroll,
    onWheel,
    onPointerDown,
    onKeyDown,
    onTouchStart,
    pause,
    jumpToLatest,
  } = useFollowActivity({
    active,
    ready: true,
    resetKey: detail.thread.id,
  });

  const scrollRowIntoLedgerView = (rowId: string) => {
    const pane = paneRef.current;
    const element = rowRefs.current.get(rowId);
    if (!pane || !element) return;
    // Never use scrollIntoView here: it scrolls every ancestor scroll
    // container, including overflow-clipped shells the user cannot scroll
    // back, which left the trajectory header clipped and unrecoverable.
    const paneRect = pane.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (rect.top >= paneRect.top && rect.bottom <= paneRect.bottom) return;
    const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
    const target =
      pane.scrollTop +
      rect.top -
      paneRect.top -
      (pane.clientHeight - rect.height) / 2;
    pane.scrollTop = Math.min(Math.max(target, 0), max);
  };

  const selectRow = (row: TrajectoryRow) => {
    pause();
    setSelectedId(row.id);
    if (folded.has(row.turnId)) {
      setFolded((current) => {
        const next = new Set(current);
        next.delete(row.turnId);
        return next;
      });
    }
    window.requestAnimationFrame(() => scrollRowIntoLedgerView(row.id));
  };
  const toggleTurn = (turnId: string) => {
    pause();
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      return next;
    });
  };
  const toggleAllTurns = () => {
    if (allFolded) setFolded(new Set());
    else setFolded(new Set(filtered.turns.map((turn) => turn.id)));
  };
  const activityLabel = activityWorkingLabel(
    detail.thread.status,
    detail.turns.at(-1)?.items ?? [],
  );
  const showThreadError =
    Boolean(detail.thread.errorMessage) &&
    !model.rows.some(
      (row) => row.kind === "error" && row.error === detail.thread.errorMessage,
    );
  const hasFilters =
    Boolean(deferredQuery.trim()) || !showReasoning || !showContext;

  const inspector = selectedRow ? (
    <TrajectoryInspector
      key={selectedRow.id}
      profileId={profileId}
      threadId={detail.thread.id}
      row={selectedRow}
      onClose={() => setSelectedId(null)}
      className="h-full"
    />
  ) : null;

  return (
    <section
      aria-label="Run trajectory"
      className={cn(
        "relative flex min-h-0 flex-col overflow-clip bg-surface",
        className,
      )}
    >
      <RunSummary model={model} active={active} now={now} />
      <Toolbar
        allFolded={allFolded}
        onToggleAllFolded={toggleAllTurns}
        showReasoning={showReasoning}
        onToggleReasoning={() => setShowReasoning((value) => !value)}
        showContext={showContext}
        onToggleContext={() => setShowContext((value) => !value)}
        query={query}
        onQueryChange={setQuery}
        records={filtered.matchCount}
        calls={callCount}
      />
      <div className="flex min-h-0 flex-1">
        <div
          ref={paneRef}
          onScroll={onScroll}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          tabIndex={0}
          aria-label="Run trajectory records"
          className="scrollbar-visible min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
        >
          <div ref={contentRef}>
            {!model.setup && filtered.turns.length > 0 && (
              <p className="border-b border-line bg-canvas/40 px-3 py-2 text-metadata text-muted">
                The run setup was not recorded. Runs created before trajectory
                capture started do not store the system prompt, tools, or
                context.
              </p>
            )}
            {filtered.turns.length ? (
              filtered.turns.map((turn) => (
                <TurnSection
                  key={turn.id}
                  turn={turn}
                  folded={folded.has(turn.id)}
                  onToggle={() => toggleTurn(turn.id)}
                  selectedId={selectedId}
                  onSelectRow={selectRow}
                  query={deferredQuery}
                  active={active}
                  now={now}
                  register={registerRow}
                />
              ))
            ) : (
              <EmptyLedger
                hasFilters={hasFilters}
                active={active}
                onClear={clearFilters}
              />
            )}
            {activityLabel && (
              <div className="px-3 py-3">
                <AgentActivityStatus label={activityLabel} />
              </div>
            )}
            {showThreadError && (
              <div
                role="alert"
                className="m-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-metadata text-destructive"
              >
                <CircleAlert
                  size={14}
                  className="mt-px shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words">
                  {detail.thread.errorMessage}
                </span>
              </div>
            )}
          </div>
        </div>
        {inlineInspector && inspector && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize record inspector"
            tabIndex={0}
            title="Drag to resize the record inspector"
            onPointerDown={onInspectorResizeStart}
            onPointerMove={onInspectorResizeMove}
            onPointerUp={endInspectorResize}
            onPointerCancel={endInspectorResize}
            onKeyDown={onInspectorResizeKey}
            className="group flex w-1.5 shrink-0 cursor-col-resize items-stretch justify-center bg-transparent transition-colors hover:bg-brand/25 focus-visible:bg-brand/40 focus-visible:outline-none"
          >
            <div className="w-px bg-line group-hover:bg-brand/60" />
          </div>
        )}
        {inlineInspector && inspector && (
          <aside
            aria-label="Record inspector"
            style={{ width: inspectorWidth }}
            className="flex min-w-[320px] shrink-0 flex-col"
          >
            {inspector}
          </aside>
        )}
      </div>
      {active && !following && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
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
      {!inlineInspector && (
        <Sheet
          open={Boolean(selectedRow)}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            aria-describedby={undefined}
            className="w-[min(100%,560px)] gap-0 p-0 sm:max-w-[560px]"
          >
            <SheetTitle className="sr-only">Record inspector</SheetTitle>
            {inspector}
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
