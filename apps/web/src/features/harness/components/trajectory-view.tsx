import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  Send,
  SlidersHorizontal,
  ShieldAlert,
  Terminal,
  User,
  Wrench,
} from "lucide-react";
import type { HarnessThreadDetail } from "@repo/backend/shared/contracts";
import { AgentActivityStatus } from "@/shared/components/ai/agent-activity-status";
import { Button } from "@/shared/components/ui/button";
import { SearchField } from "@/shared/components/ui/search-field";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { ActivitySkeleton } from "@/shared/components/ui/loading-layouts";
import { cn } from "@/shared/lib/cn";
import { useHarnessThread } from "../hooks/use-harness";
import { useFollowActivity } from "../hooks/use-follow-activity";
import { activityWorkingLabel, isActiveThreadStatus } from "../lib/status";
import {
  filterTrajectoryTurns,
  formatTrajectoryDuration,
  projectTrajectory,
  requestRow,
  type TrajectoryDetailModel,
  type TrajectoryKind,
  type TrajectoryRequest,
  type TrajectoryRow,
  type TrajectoryTurnModel,
} from "../lib/trajectory";
import { formatRunDate, HarnessStatus } from "./harness-transcript";
import { TrajectoryInspector } from "./trajectory-inspector";

const kindIcons: Record<TrajectoryKind, typeof Terminal> = {
  system: Info,
  user: User,
  context: Info,
  assistant: MessageSquare,
  reasoning: Brain,
  tool: Wrench,
  result: CheckCircle2,
  request: ShieldAlert,
  model_request: Send,
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
    <header className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-metadata text-muted">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <HarnessStatus status={thread.status} label />
        <span className="min-w-0 break-all font-mono">{thread.model}</span>
        {duration !== null && (
          <span className="tabular-nums">
            {active ? "Working for" : "Worked for"}{" "}
            {formatTrajectoryDuration(duration)}
          </span>
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost">
            Run details
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-label="Run details"
          className="w-64 p-3 text-metadata text-muted"
        >
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            {" "}
            <dt>Run</dt>
            <dd className="break-words text-foreground">{thread.title}</dd>
            <dt>Created</dt>
            <dd>{formatRunDate(thread.createdAt)}</dd>
            <dt>Runtime</dt>
            <dd>{thread.runtimeMode}</dd>
            <dt>Turns</dt>
            <dd>{model.stats.turns}</dd>
            <dt>Model requests</dt>
            <dd>{model.requests.length}</dd>
            <dt>Tool calls</dt>
            <dd>{model.stats.toolCalls}</dd>
            {model.stats.tokens && (
              <>
                <dt>Tokens</dt>
                <dd>{model.stats.tokens.total.toLocaleString()}</dd>
              </>
            )}
          </dl>
        </PopoverContent>
      </Popover>
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
  hasFilters,
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
  hasFilters: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Trajectory controls"
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      <SearchField
        aria-label="Search records"
        placeholder="Search records"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onClear={() => onQueryChange("")}
        className="w-48 min-w-32 max-w-72 flex-1 sm:w-56"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <SlidersHorizontal size={14} aria-hidden="true" />
            Display
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            checked={showReasoning}
            onCheckedChange={onToggleReasoning}
          >
            Reasoning
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showContext}
            onCheckedChange={onToggleContext}
          >
            Prompt and context
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onToggleAllFolded}>
            {allFolded ? "Expand all turns" : "Collapse all turns"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {hasFilters && (
        <span role="status" className="text-metadata text-muted tabular-nums">
          {records} matching {records === 1 ? "record" : "records"}
        </span>
      )}
    </div>
  );
}

function AttemptHeader({
  attempt,
}: {
  attempt: TrajectoryTurnModel["attempts"][number];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/60 px-3 py-1 text-metadata text-muted">
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
  query,
  onSelect,
  register,
  selected,
}: {
  row: TrajectoryRow;
  query: string;
  onSelect: (id: string) => void;
  register: (id: string, element: HTMLButtonElement | null) => void;
  selected: boolean;
}) {
  const Icon =
    row.kind === "tool"
      ? (toolIcons[row.item?.type ?? ""] ?? Wrench)
      : row.kind === "request"
        ? MessageCircleQuestion
        : kindIcons[row.kind];
  const failed = row.status === "failed" || row.tool?.isError === true;
  const kind = row.tag.charAt(0) + row.tag.slice(1).toLowerCase();
  const preview =
    (row.kind === "context" || row.kind === "system") && !query.trim()
      ? ""
      : row.preview;
  return (
    <button
      type="button"
      ref={(element) => register(row.id, element)}
      aria-label={`${kind}: ${row.summary}`}
      aria-pressed={selected}
      onClick={() => onSelect(row.id)}
      className={cn(
        "group flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-3",
        selected && "bg-elevated",
      )}
    >
      <Icon
        size={15}
        aria-hidden="true"
        className={cn("shrink-0", failed ? "text-destructive" : "text-muted")}
      />
      <span className="hidden w-16 shrink-0 text-metadata text-muted @min-[480px]/records:block">
        {kind}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-supporting",
            row.kind === "reasoning" && "text-muted",
            row.tool && "font-mono",
          )}
        >
          <Highlight text={row.summary} query={query} />
        </span>
        {preview && (
          <span className="mt-0.5 block truncate text-metadata text-muted">
            <Highlight text={preview} query={query} />
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-metadata tabular-nums text-muted">
        {row.tokens && (
          <span className="hidden @min-[480px]/records:inline">
            {row.tokens.total.toLocaleString()} tok
          </span>
        )}
        {row.durationMs !== null && row.kind !== "user" && (
          <span>{formatTrajectoryDuration(row.durationMs)}</span>
        )}
        {row.status !== "completed" && <HarnessStatus status={row.status} />}
      </span>
      <ChevronRight
        size={13}
        aria-hidden="true"
        className={cn(
          "shrink-0 text-muted opacity-60 transition-transform group-hover:opacity-100 group-focus-visible:opacity-100",
          selected && "text-foreground opacity-100",
        )}
      />
    </button>
  );
}

function TurnSection({
  turn,
  folded,
  onToggle,
  onSelectRow,
  requestsByRow,
  requestsByErrorRow,
  pendingByAttempt,
  query,
  active,
  now,
  register,
  selectedId,
}: {
  turn: TrajectoryTurnModel;
  folded: boolean;
  onToggle: () => void;
  onSelectRow: (id: string) => void;
  requestsByRow: Map<string, TrajectoryRequest>;
  requestsByErrorRow: Map<string, TrajectoryRequest>;
  pendingByAttempt: Map<string, TrajectoryRequest>;
  query: string;
  active: boolean;
  now: number;
  register: (id: string, element: HTMLButtonElement | null) => void;
  selectedId: string | null;
}) {
  const duration = durationFor(turn.startedAt, turn.completedAt, active, now);
  const record = (row: TrajectoryRow) => (
    <>
      <RowButton
        row={row}
        query={query}
        onSelect={onSelectRow}
        register={register}
        selected={selectedId === row.id}
      />
    </>
  );
  return (
    <section aria-label={`Turn ${turn.ordinal}`}>
      <button
        type="button"
        aria-expanded={!folded}
        onClick={onToggle}
        className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-line bg-canvas px-2.5 py-2 text-left transition-colors hover:bg-elevated/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
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
        <span className="hidden min-w-0 truncate font-mono text-metadata text-muted @min-[480px]/records:inline">
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
          {turn.attempts.map((attempt) => {
            const pending = pendingByAttempt.get(attempt.id) ?? null;
            return (
              <div key={attempt.id} className="py-1">
                {turn.attempts.length > 1 && (
                  <AttemptHeader attempt={attempt} />
                )}
                {attempt.rows.map((row) => {
                  const request =
                    requestsByRow.get(row.id) ??
                    requestsByErrorRow.get(row.id) ??
                    null;
                  return (
                    <Fragment key={row.id}>
                      {request && record(requestRow(request))}
                      {record(row)}
                    </Fragment>
                  );
                })}
                {pending && record(requestRow(pending))}
              </div>
            );
          })}
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
        <ActivitySkeleton header={false} trajectory />
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
  projectFilesOpen = false,
  inspectorContainer,
  onInspectorModalChange,
}: {
  profileId: string;
  detail: HarnessThreadDetail;
  className?: string;
  projectFilesOpen?: boolean;
  inspectorContainer?: HTMLElement | null;
  onInspectorModalChange?: (modal: boolean) => void;
}) {
  const model = useMemo(() => projectTrajectory(detail), [detail]);
  const active = isActiveThreadStatus(detail.thread.status);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [showReasoning, setShowReasoning] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [selection, setSelection] = useState<{
    id: string | null;
    projectFilesOpen: boolean;
  }>({
    id: null,
    projectFilesOpen,
  });
  if (selection.projectFilesOpen !== projectFilesOpen) {
    setSelection({ id: null, projectFilesOpen });
  }
  const selectedId = selection.id;
  const setSelectedId = (id: string | null) =>
    setSelection({ id, projectFilesOpen });
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [layoutElement, setLayoutElement] = useState<HTMLDivElement | null>(
    null,
  );
  const portalContainer = inspectorContainer ?? layoutElement;
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [inspectorWidth, setInspectorWidth] = useState(50);
  const resizing = useRef(false);
  const originId = useRef<string | null>(null);
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
  const selectedRequest = model.requests.find(
    (request) => request.id === selectedId,
  );
  const selectedRow = selectedRequest
    ? requestRow(selectedRequest)
    : (model.rows.find((row) => row.id === selectedId) ?? null);
  const inspectorOpen = Boolean(selectedRow);
  useEffect(() => {
    if (!portalContainer) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(portalContainer);
    return () => observer.disconnect();
  }, [portalContainer]);
  const compact = containerWidth < 900;
  const minWidth = containerWidth ? (380 / containerWidth) * 100 : 30;
  const maxWidth = containerWidth
    ? Math.min(75, ((containerWidth - 300) / containerWidth) * 100)
    : 75;
  const panelWidth = Math.min(maxWidth, Math.max(minWidth, inspectorWidth));
  useEffect(() => {
    if (!onInspectorModalChange) return;
    onInspectorModalChange(inspectorOpen && (inspectorExpanded || compact));
    return () => {
      onInspectorModalChange(false);
    };
  }, [inspectorOpen, inspectorExpanded, compact, onInspectorModalChange]);
  const allFolded =
    filtered.turns.length > 0 &&
    filtered.turns.every((turn) => folded.has(turn.id));
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

  const openRecord = (id: string) => {
    pause();
    originId.current = id;
    if (selectedId === id) setInspectorExpanded(false);
    setSelectedId(selectedId === id ? null : id);
  };
  const openLinkedRecord = (id: string) => {
    pause();
    clearFilters();
    setFolded(new Set());
    originId.current = id;
    setSelectedId(id);
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
    });
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

  const backToTrajectory = () => {
    setSelectedId(null);
    setInspectorExpanded(false);
    requestAnimationFrame(() => {
      (rowRefs.current.get(originId.current ?? "") ?? paneRef.current)?.focus({
        preventScroll: true,
      });
    });
  };

  return (
    <section
      aria-label="Run trajectory"
      className={cn(
        "relative flex min-h-0 min-w-0 max-w-full flex-col overflow-clip",
        className,
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-2">
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
            hasFilters={hasFilters}
          />
        </div>
        <div
          ref={setLayoutElement}
          className="@container flex min-h-0 min-w-0 flex-1"
        >
          <div
            ref={paneRef}
            onScroll={onScroll}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onTouchStart={onTouchStart}
            tabIndex={0}
            aria-label="Run trajectory records"
            className={cn(
              "@container/records scrollbar-visible min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <div ref={contentRef} className="min-w-0 max-w-full">
              {!model.setup && filtered.turns.length > 0 && (
                <p className="px-3 py-2 text-metadata text-muted">
                  No setup was recorded for this run.
                </p>
              )}
              {filtered.turns.length ? (
                filtered.turns.map((turn) => (
                  <TurnSection
                    key={turn.id}
                    turn={turn}
                    folded={folded.has(turn.id)}
                    onToggle={() => toggleTurn(turn.id)}
                    onSelectRow={openRecord}
                    requestsByRow={model.requestsByAssistantRow}
                    requestsByErrorRow={model.requestsByErrorRow}
                    pendingByAttempt={model.pendingByAttempt}
                    query={deferredQuery}
                    active={active}
                    now={now}
                    register={registerRow}
                    selectedId={selectedId}
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
          {selectedRow &&
            portalContainer &&
            createPortal(
              <aside
                id="trajectory-record-inspector"
                aria-label="Trajectory record inspector"
                className={cn(
                  "absolute inset-y-0 right-0 z-30 flex min-h-0 min-w-0 flex-col border-l border-line bg-panel shadow-xl",
                )}
                style={{
                  width:
                    inspectorExpanded || compact ? "100%" : `${panelWidth}%`,
                }}
              >
                {!compact && !inspectorExpanded && (
                  <div
                    role="separator"
                    aria-label="Resize record inspector"
                    aria-orientation="vertical"
                    aria-controls="trajectory-record-inspector"
                    aria-valuemin={Math.round(minWidth)}
                    aria-valuemax={Math.round(maxWidth)}
                    aria-valuenow={Math.round(panelWidth)}
                    aria-valuetext={`${Math.round(panelWidth)} percent of workspace`}
                    tabIndex={0}
                    className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none outline-none focus-visible:bg-foreground/10"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      resizing.current = true;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      event.preventDefault();
                    }}
                    onPointerMove={(event) => {
                      if (!resizing.current || !portalContainer) return;
                      const bounds = portalContainer.getBoundingClientRect();
                      setInspectorWidth(
                        Math.min(
                          maxWidth,
                          Math.max(
                            minWidth,
                            ((bounds.right - event.clientX) / bounds.width) *
                              100,
                          ),
                        ),
                      );
                    }}
                    onPointerUp={(event) => {
                      resizing.current = false;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }}
                    onPointerCancel={() => {
                      resizing.current = false;
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowLeft" ||
                        event.key === "ArrowRight"
                      ) {
                        event.preventDefault();
                        setInspectorWidth(
                          Math.min(
                            maxWidth,
                            Math.max(
                              minWidth,
                              panelWidth + (event.key === "ArrowLeft" ? 2 : -2),
                            ),
                          ),
                        );
                      } else if (event.key === "Home" || event.key === "End") {
                        event.preventDefault();
                        setInspectorWidth(
                          event.key === "Home" ? minWidth : maxWidth,
                        );
                      }
                    }}
                  >
                    <span className="absolute inset-y-0 left-1/2 w-px bg-transparent transition-colors group-hover:bg-foreground/40 group-focus-visible:bg-foreground/60" />
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong transition-colors group-hover:bg-muted group-focus-visible:bg-foreground"
                    />
                  </div>
                )}
                <TrajectoryInspector
                  key={selectedRow.id}
                  profileId={profileId}
                  threadId={detail.thread.id}
                  row={selectedRow}
                  onBack={backToTrajectory}
                  onOpenRecord={openLinkedRecord}
                  focusOnOpen
                  expanded={inspectorExpanded}
                  onToggleExpanded={() =>
                    setInspectorExpanded((value) => !value)
                  }
                />
              </aside>,
              portalContainer,
            )}
        </div>
      </div>
      {!selectedId && active && !following && (
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
    </section>
  );
}
