import { useEffect, useState } from "react";
import { formatWorkDuration, workDuration } from "../lib/work-duration";
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  CircleSlash,
  Clock3,
  FilePenLine,
  FileSearch,
  FileText,
  Globe,
  Info,
  LoaderCircle,
  MessageCircleQuestion,
  RotateCcw,
  ShieldAlert,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
import type {
  HarnessItem,
  HarnessItemType,
  HarnessThreadDetail,
} from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Markdown } from "@/shared/components/markdown";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/cn";
import {
  useHarnessDecision,
  useHarnessThread,
  useRetryHarnessThread,
  useStopHarnessThread,
} from "../hooks/use-harness";
import { runKindMeta } from "../lib/run-kinds";
import { activityWorkingLabel, isActiveThreadStatus } from "../lib/status";
import { AgentActivityStatus } from "@/shared/components/ai/agent-activity-status";
import { setupMessageText } from "../lib/activity";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : null;
}

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

function prettyJson(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function payloadOutput(payload: Record<string, unknown>) {
  const output = payload.output;
  if (typeof output === "string") return prettyJson(output);
  if (!output || typeof output !== "object") return "";
  const content = (output as { content?: unknown }).content;
  if (!Array.isArray(content)) return JSON.stringify(output, null, 2);
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const value = (part as { text?: unknown }).text;
        if (typeof value === "string") return prettyJson(value);
      }
      return JSON.stringify(part, null, 2);
    })
    .filter(Boolean)
    .join("\n\n");
}

function commandResult(payload: Record<string, unknown>) {
  const output = payload.output;
  let text = "";
  if (typeof output === "string") text = output;
  else if (output && typeof output === "object") {
    const content = (output as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const first = content[0] as { text?: unknown } | undefined;
      if (typeof first?.text === "string") text = first.text;
    }
  }
  if (!text.trim()) return null;
  try {
    const report = JSON.parse(text) as {
      result?: {
        output?: unknown;
        exitCode?: unknown;
        durationMs?: unknown;
        status?: unknown;
      };
    };
    const result = report.result;
    if (!result || typeof result !== "object") return null;
    return {
      output: typeof result.output === "string" ? result.output.trimEnd() : "",
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      durationMs:
        typeof result.durationMs === "number" ? result.durationMs : null,
    };
  } catch {
    return null;
  }
}

const statusMeta = {
  queued: { label: "Queued", icon: Clock3, tone: "muted" },
  pending: { label: "Pending", icon: Clock3, tone: "muted" },
  running: { label: "Running", icon: LoaderCircle, tone: "warning" },
  waiting: { label: "Waiting", icon: CircleHelp, tone: "warning" },
  completed: { label: "Completed", icon: CheckCircle2, tone: "success" },
  failed: { label: "Failed", icon: CircleAlert, tone: "destructive" },
  cancelled: { label: "Cancelled", icon: Square, tone: "muted" },
  interrupted: { label: "Interrupted", icon: CircleSlash, tone: "warning" },
} as const;

const toneClass = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  muted: "text-muted",
} as const;

export function HarnessStatus({
  status,
  label = false,
}: {
  status: string;
  label?: boolean;
}) {
  const meta =
    statusMeta[status as keyof typeof statusMeta] ?? statusMeta.interrupted;
  const Icon = meta.icon;
  const spinning = status === "running";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-metadata",
        toneClass[meta.tone],
      )}
    >
      <Icon
        size={13}
        aria-hidden="true"
        className={cn(
          "shrink-0",
          spinning && "animate-spin motion-reduce:animate-none",
        )}
      />
      {label ? (
        <span className="truncate">{meta.label}</span>
      ) : (
        <span className="sr-only">{meta.label}</span>
      )}
    </span>
  );
}

const runDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatRunDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : runDate.format(date);
}

function formatTokens(value: number) {
  return value.toLocaleString();
}

function normalizedText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

/** A failed run often records the same reason as a transcript error item. */
function transcriptHasError(
  turns: HarnessThreadDetail["turns"],
  message: string,
) {
  const target = normalizedText(message);
  return turns.some((turn) =>
    turn.items.some(
      (item) => item.type === "error" && normalizedText(item.text) === target,
    ),
  );
}

const rowClass =
  "flex cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 text-metadata text-muted outline-none transition-colors hover:bg-elevated/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden";

const chevronClass =
  "size-3 shrink-0 text-muted transition-transform duration-150 group-open:rotate-90";

const toolIcons: Partial<Record<HarnessItemType, typeof Terminal>> = {
  command_execution: Terminal,
  file_change: FilePenLine,
  file_read: FileText,
  file_search: FileSearch,
  web_search: Globe,
  tool_call: Wrench,
};

const toolTypes = new Set<HarnessItemType>([
  "command_execution",
  "file_change",
  "file_read",
  "file_search",
  "web_search",
  "tool_call",
]);

function toolLabel(item: HarnessItem) {
  const payload = item.payload;
  const input = payload.input as Record<string, unknown> | undefined;
  const inputPath = stringValue(input?.path) || stringValue(payload.path);
  const path = inputPath || item.title || "";
  const title = item.title ?? "";
  if (item.type === "command_execution") {
    const command =
      typeof payload.input === "string"
        ? payload.input
        : stringValue(input?.command) || stringValue(payload.command);
    return { prefix: "", text: command || "Command", mono: true };
  }
  if (title === "list_project_files")
    return { prefix: "Listed", text: inputPath || "project files" };
  if (title === "search_project_files")
    return {
      prefix: "Searched",
      text:
        stringValue(input?.query) ||
        stringValue(payload.query) ||
        "project files",
    };
  if (title === "read_project_file")
    return { prefix: "Read", text: inputPath || "file" };
  if (item.type === "file_change") return { prefix: "Edited", text: path };
  if (item.type === "file_read") return { prefix: "Read", text: path };
  if (item.type === "file_search")
    return {
      prefix: "Searched",
      text: stringValue(payload.query) || path,
    };
  if (item.type === "web_search")
    return {
      prefix: "Web search",
      text: stringValue(payload.query) || item.title || "",
    };
  return {
    prefix: "",
    text: title ? title.replaceAll("_", " ") : item.type.replaceAll("_", " "),
  };
}

function PreBlock({ children }: { children: string }) {
  return (
    <pre className="scrollbar-quiet max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas px-2.5 py-2 font-mono text-code leading-relaxed text-muted select-text">
      {children}
    </pre>
  );
}

function ToolRow({ item }: { item: HarnessItem }) {
  const payload = item.payload;
  const Icon = toolIcons[item.type] ?? Wrench;
  const { prefix, text, mono } = toolLabel(item);
  const command =
    item.type === "command_execution" ? commandResult(payload) : null;
  const output = command ? command.output : payloadOutput(payload);
  const rawInput = payload.input;
  const input =
    item.type === "tool_call" && rawInput !== undefined
      ? typeof rawInput === "string"
        ? rawInput
        : JSON.stringify(rawInput, null, 2)
      : "";
  const exitCode = command?.exitCode ?? numberValue(payload.exitCode);
  const failed = item.status === "failed";
  const expandable = Boolean(output || input);
  const summary = (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
      <Icon
        size={14}
        className={cn("shrink-0", failed ? "text-destructive" : "text-muted")}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">
        {prefix && <span className="text-foreground/80">{prefix} </span>}
        <span className={cn(mono && "font-mono")}>{text}</span>
      </span>
      {exitCode !== null && (
        <span className="shrink-0 tabular-nums text-muted">
          exit {exitCode}
          {command?.durationMs
            ? ` · ${formatDuration(command.durationMs)}`
            : ""}
        </span>
      )}
      {item.status !== "completed" && <HarnessStatus status={item.status} />}
      {expandable && (
        <ChevronRight size={13} className={chevronClass} aria-hidden="true" />
      )}
    </span>
  );
  if (!expandable)
    return (
      <div className="rounded-md px-1.5 py-1 text-metadata">{summary}</div>
    );
  return (
    <details className="group">
      <summary className={rowClass}>{summary}</summary>
      <div className="mt-1 mb-2 ml-6 space-y-2">
        {input && <PreBlock>{input}</PreBlock>}
        {output && <PreBlock>{output}</PreBlock>}
      </div>
    </details>
  );
}

function ReasoningRow({ text }: { text: string }) {
  const preview = text.trim().split("\n")[0]?.trim() ?? "";
  return (
    <details className="group">
      <summary
        className={rowClass}
        aria-label={`Reasoning${preview ? `: ${preview}` : ""}`}
      >
        <Brain size={14} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-foreground/80">Reasoning</span>
          {preview && <span className="text-muted"> · {preview}</span>}
        </span>
        <ChevronRight size={13} className={chevronClass} aria-hidden="true" />
      </summary>
      <div className="scrollbar-quiet mt-1 mb-2 ml-6 max-h-80 overflow-y-auto border-l border-line pl-3 text-metadata leading-5 text-muted">
        <p className="whitespace-pre-wrap break-words select-text">{text}</p>
      </div>
    </details>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <h4 className="sr-only">You</h4>
      <div className="max-w-[85%] rounded-xl bg-elevated px-3.5 py-2.5 text-supporting leading-6">
        <Markdown>{text}</Markdown>
      </div>
    </div>
  );
}

function AssistantMessage({ text }: { text: string }) {
  return (
    <div className="min-w-0 text-supporting leading-6">
      <h4 className="sr-only">Agent</h4>
      <Markdown>{text}</Markdown>
    </div>
  );
}

function RequestCard({
  item,
  profileId,
  threadId,
}: {
  item: HarnessItem;
  profileId: string;
  threadId: string;
}) {
  const decide = useHarnessDecision(profileId, threadId);
  const [answer, setAnswer] = useState("");
  const payload = item.payload;
  const prompt = stringValue(payload.prompt) || item.text || "";
  const requestId = stringValue(payload.requestId);
  const options = Array.isArray(payload.options)
    ? payload.options.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const pending = item.status === "pending";
  const isQuestion = item.type === "user_input_request";
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        pending ? "border-warning/40 bg-warning/5" : "border-line bg-panel",
      )}
    >
      <p className="flex items-center gap-1.5 text-metadata font-medium text-warning">
        {isQuestion ? (
          <MessageCircleQuestion size={14} aria-hidden="true" />
        ) : (
          <ShieldAlert size={14} aria-hidden="true" />
        )}
        {isQuestion ? "The agent needs an answer" : "Approval needed"}
      </p>
      <p className="mt-1.5 break-words text-supporting leading-5 text-foreground">
        {prompt}
      </p>
      {isQuestion && !!options.length && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-metadata text-muted">
          {options.map((option) => (
            <li key={option}>{option}</li>
          ))}
        </ul>
      )}
      {pending && requestId ? (
        <div className="mt-2.5 space-y-2">
          {isQuestion && (
            <Textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              aria-label="Answer"
              placeholder="Type your answer"
              rows={2}
            />
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="primary"
              disabled={decide.isPending || (isQuestion && !answer.trim())}
              onClick={() =>
                decide.mutate({
                  requestId,
                  decision: {
                    decision: "allow",
                    ...(answer.trim() ? { answer: answer.trim() } : {}),
                  },
                })
              }
            >
              {decide.isPending && (
                <LoaderCircle
                  size={13}
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              {isQuestion ? "Send answer" : "Allow"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate({ requestId, decision: { decision: "deny" } })
              }
            >
              {isQuestion ? "Skip" : "Deny"}
            </Button>
          </div>
          {decide.error && (
            <p role="alert" className="text-metadata text-destructive">
              {decide.error.message}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-metadata text-muted">
          {stringValue(payload.decision) || "Answered"}
        </p>
      )}
    </div>
  );
}

function Item({
  item,
  profileId,
  threadId,
}: {
  item: HarnessItem;
  profileId: string;
  threadId: string;
}) {
  if (item.type === "user_message")
    return item.text?.trim() ? <UserMessage text={item.text} /> : null;
  if (item.type === "assistant_message")
    return item.text?.trim() ? <AssistantMessage text={item.text} /> : null;
  if (item.type === "reasoning")
    return item.text?.trim() ? <ReasoningRow text={item.text} /> : null;
  if (item.type === "approval_request" || item.type === "user_input_request")
    return (
      <RequestCard item={item} profileId={profileId} threadId={threadId} />
    );
  if (item.type === "error")
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-metadata text-destructive"
      >
        <CircleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">
          {item.text ?? item.title ?? "The run failed."}
        </span>
      </div>
    );
  if (item.type === "system_notice")
    return (
      <p className="flex items-center gap-1.5 py-0.5 text-metadata text-muted">
        <Info size={13} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{item.text}</span>
      </p>
    );
  return <ToolRow item={item} />;
}

type Block =
  { kind: "tools"; items: HarnessItem[] } | { kind: "item"; item: HarnessItem };

function itemBlocks(items: HarnessItem[]) {
  const blocks: Block[] = [];
  for (const item of items) {
    if (!toolTypes.has(item.type)) {
      blocks.push({ kind: "item", item });
      continue;
    }
    const last = blocks.at(-1);
    if (last?.kind === "tools") last.items.push(item);
    else blocks.push({ kind: "tools", items: [item] });
  }
  return blocks;
}

function WorkSummary({ turn }: { turn: HarnessThreadDetail["turns"][number] }) {
  const active = isActiveThreadStatus(turn.status);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !turn.startedAt || turn.completedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, turn.startedAt, turn.completedAt]);
  const duration = workDuration(turn.startedAt, turn.completedAt, active, now);
  if (duration === null) return null;
  const commands = turn.items.filter(
    (item) =>
      item.type === "command_execution" &&
      (item.status === "completed" || item.status === "failed"),
  ).length;
  return (
    <details className="group mt-3 text-metadata text-muted">
      <summary className={rowClass}>
        <span className="tabular-nums">
          {active ? "Working for" : "Worked for"} {formatWorkDuration(duration)}
        </span>
        <ChevronRight aria-hidden="true" className={chevronClass} />
      </summary>
      <div className="mt-1 space-y-1 border-t border-line px-1.5 pt-2">
        {commands > 0 && (
          <p className="flex items-center gap-2">
            <Terminal size={14} aria-hidden="true" />
            Ran {commands} {commands === 1 ? "command" : "commands"}
          </p>
        )}
        <p>Started {formatRunDate(turn.startedAt!)}</p>
        {turn.completedAt && <p>Finished {formatRunDate(turn.completedAt)}</p>}
      </div>
    </details>
  );
}

function Turn({
  detail,
  turn,
  profileId,
}: {
  detail: HarnessThreadDetail;
  turn: HarnessThreadDetail["turns"][number];
  profileId: string;
}) {
  const conversation = detail.thread.kind === "project_scaffold";
  const turnLabel = "Turn";
  return (
    <div
      aria-label={conversation ? undefined : `${turnLabel} ${turn.ordinal}`}
      className={
        conversation
          ? undefined
          : "border-t border-line pt-4 first:border-t-0 first:pt-0"
      }
    >
      {!conversation && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-metadata text-muted">
          <span className="font-medium text-foreground">
            {turnLabel} {turn.ordinal}
          </span>
          <HarnessStatus status={turn.status} label />
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span className="hidden font-mono sm:inline">{turn.model}</span>
          {turn.totalTokens !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {formatTokens(turn.totalTokens)} tokens
              </span>
            </>
          )}
        </div>
      )}
      <div className="space-y-3">
        {itemBlocks(turn.items).map((block, index) =>
          block.kind === "tools" ? (
            <div key={`tools-${index}`} className="space-y-0.5">
              {block.items.map((item) => (
                <ToolRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <Item
              key={block.item.id}
              item={
                conversation && block.item.type === "user_message"
                  ? { ...block.item, text: setupMessageText(block.item.text) }
                  : block.item
              }
              profileId={profileId}
              threadId={detail.thread.id}
            />
          ),
        )}
      </div>
      <WorkSummary turn={turn} />
    </div>
  );
}

function TranscriptSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading run transcript"
      className="space-y-3"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function HarnessTranscript({
  profileId,
  threadId,
  className,
}: {
  profileId: string;
  threadId: string;
  className?: string;
}) {
  const query = useHarnessThread(profileId, threadId);
  if (query.isPending) return <TranscriptSkeleton />;
  if (query.error)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-metadata text-destructive">
          {query.error.message}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  if (!query.data) return null;
  return (
    <HarnessTranscriptContent
      profileId={profileId}
      detail={query.data}
      className={className}
    />
  );
}

export function HarnessTranscriptContent({
  profileId,
  detail,
  className,
}: {
  profileId: string;
  detail: HarnessThreadDetail;
  className?: string;
}) {
  const stop = useStopHarnessThread(profileId);
  const retry = useRetryHarnessThread(profileId);
  const conversation = detail.thread.kind === "project_scaffold";
  const active = isActiveThreadStatus(detail.thread.status);
  const activityLabel = activityWorkingLabel(
    detail.thread.status,
    detail.turns.at(-1)?.items ?? [],
  );
  const retryable = ["failed", "cancelled", "interrupted"].includes(
    detail.thread.status,
  );
  const kind = runKindMeta(detail.thread.kind);
  const KindIcon = kind.icon;
  const threadError = detail.thread.errorMessage;
  const showThreadError = Boolean(
    threadError && !transcriptHasError(detail.turns, threadError),
  );
  return (
    <article
      aria-label={conversation ? "Codebase setup messages" : "Run transcript"}
      className={cn("min-w-0", className)}
    >
      {!conversation && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <KindIcon
                size={15}
                className="shrink-0 text-muted"
                aria-hidden="true"
              />
              <h3 className="min-w-0 flex-1 truncate text-ui font-medium">
                {detail.thread.title}
              </h3>
              <HarnessStatus status={detail.thread.status} label />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[23px] text-metadata text-muted">
              <span>{kind.label}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRunDate(detail.thread.createdAt)}</span>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span className="hidden font-mono sm:inline">
                {detail.thread.model}
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span className="hidden sm:inline">
                {detail.thread.runtimeMode}
              </span>
            </p>
          </div>
          {(active || retryable) && (
            <div className="flex items-center gap-1">
              {active && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={stop.isPending}
                  onClick={() => stop.mutate(detail.thread.id)}
                >
                  {stop.isPending ? (
                    <LoaderCircle
                      size={13}
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Square size={11} />
                  )}
                  Stop
                </Button>
              )}
              {retryable && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(detail.thread.id)}
                >
                  {retry.isPending ? (
                    <LoaderCircle
                      size={13}
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <RotateCcw size={13} />
                  )}
                  Retry
                </Button>
              )}
            </div>
          )}
        </header>
      )}
      {(stop.error || retry.error) && (
        <p role="alert" className="mt-2 text-metadata text-destructive">
          {(stop.error ?? retry.error)?.message}
        </p>
      )}
      <div className={conversation ? "space-y-3" : "mt-5 space-y-6"}>
        {detail.turns.length ? (
          detail.turns.map((turn) => (
            <Turn
              key={turn.id}
              detail={detail}
              turn={turn}
              profileId={profileId}
            />
          ))
        ) : (
          <p className="text-supporting text-muted">
            {conversation ? "No setup messages yet." : "No turns recorded yet."}
          </p>
        )}
      </div>
      {activityLabel && (
        <div className="mt-4">
          <AgentActivityStatus label={activityLabel} />
        </div>
      )}
      {showThreadError && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-metadata text-destructive"
        >
          <CircleAlert
            size={14}
            className="mt-px shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0 break-words">{threadError}</span>
        </div>
      )}
    </article>
  );
}
