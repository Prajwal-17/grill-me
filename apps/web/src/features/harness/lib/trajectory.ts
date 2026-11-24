import type {
  HarnessItem,
  HarnessItemStatus,
  HarnessThread,
  HarnessThreadDetail,
  HarnessTurn,
  HarnessTurnAttempt,
} from "@repo/backend/shared/contracts";
import { setupMessageText } from "./activity";
import { isActiveThreadStatus } from "./status";

/** Dense audit rows derived from the durable harness ledger. */
export type TrajectoryKind =
  | "system"
  | "user"
  | "context"
  | "assistant"
  | "reasoning"
  | "tool"
  | "result"
  | "request"
  | "model_request"
  | "notice"
  | "error";

export type TrajectoryTokenUsage = {
  input: number;
  output: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
};

export type TrajectoryToolSnapshot = {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
};

export type TrajectoryPromptSnapshot = {
  systemPrompt?: string;
  context?: string;
  tools?: TrajectoryToolSnapshot[];
};

export type TrajectoryTool = {
  name: string;
  input: string;
  inputSummary: string;
  output: string;
  outputSummary: string;
  exitCode: number | null;
  durationMs: number | null;
  details?: unknown;
  isError: boolean;
  truncated: boolean;
};

/** One model request: the records fed to the model plus its reply. */
export type TrajectoryRequest = {
  id: string;
  /** Run-wide request number, in the order requests were issued. */
  ordinal: number;
  turnId: string;
  turnOrdinal: number;
  attemptId: string;
  attemptOrdinal: number | null;
  status: "completed" | "running" | "failed" | "cancelled";
  model: string | null;
  provider: string | null;
  stopReason: string | null;
  /** Best available timestamp for when the request went out. */
  sentAt: number | null;
  completedAt: number | null;
  /** Reply generation time from the assistant record. */
  durationMs: number | null;
  tokens: TrajectoryTokenUsage | null;
  /** Tokens consumed by the run up to and including this request. */
  cumulativeTokens: TrajectoryTokenUsage | null;
  toolCallCount: number;
  /** Records whose content fed this request (inputs, not the reply). */
  inputRows: TrajectoryRow[];
  /** The assistant reply that concluded the request, when one was recorded. */
  assistantRow: TrajectoryRow | null;
  error?: string;
};

export type TrajectoryRow = {
  id: string;
  ordinal: number;
  kind: TrajectoryKind;
  tag: string;
  status: HarnessItemStatus;
  title: string | null;
  summary: string;
  preview: string;
  search: string;
  tool?: TrajectoryTool;
  /** Present on the synthetic row that represents a model request. */
  request?: TrajectoryRequest;
  item?: HarnessItem;
  prompt?: TrajectoryPromptSnapshot;
  tokens?: TrajectoryTokenUsage;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error?: string;
  decision?: string;
  isCompletion?: boolean;
  turnId: string;
  turnOrdinal: number;
  attemptOrdinal: number | null;
};

export type TrajectoryAttemptModel = {
  id: string;
  ordinal: number | null;
  status: HarnessTurn["status"];
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error?: string;
  rows: TrajectoryRow[];
};

export type TrajectoryTurnModel = {
  id: string;
  ordinal: number;
  status: HarnessTurn["status"];
  model: string;
  inputText: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  tokens: TrajectoryTokenUsage | null;
  toolCount: number;
  error?: string;
  attempts: TrajectoryAttemptModel[];
  rows: TrajectoryRow[];
};

export type TrajectoryStats = {
  turns: number;
  records: number;
  toolCalls: number;
  fileReads: number;
  commands: number;
  searches: number;
  reasoning: number;
  tokens: TrajectoryTokenUsage | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
};

/** The prompt, tool catalog, and context captured when the run started. */
export type TrajectoryRunSetup = {
  systemItemId: string | null;
  systemPrompt: string | null;
  tools: TrajectoryToolSnapshot[];
  userText: string | null;
  contextItemId: string | null;
  context: string | null;
  truncated: boolean;
};

export type TrajectoryDetailModel = {
  thread: HarnessThread;
  turns: TrajectoryTurnModel[];
  rows: TrajectoryRow[];
  /** Model requests in issue order, numbered run-wide. */
  requests: TrajectoryRequest[];
  /** Closed requests keyed by the assistant reply that concluded them. */
  requestsByAssistantRow: Map<string, TrajectoryRequest>;
  /** Failed requests keyed by the error record that ended them. */
  requestsByErrorRow: Map<string, TrajectoryRequest>;
  /** In-flight requests keyed by the attempt that is awaiting their reply. */
  pendingByAttempt: Map<string, TrajectoryRequest>;
  stats: TrajectoryStats;
  setup: TrajectoryRunSetup | null;
};

export type TrajectoryTurnDetail = HarnessThreadDetail["turns"][number];

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isoTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatTrajectoryValue(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseTrajectoryJson(trimmed);
    if (parsed !== null) return JSON.stringify(parsed, null, 2);
    return value;
  }
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Closing brackets for JSON that storage truncated mid-record. */
function truncatedJsonSuffix(text: string): string | null {
  let inString = false;
  let escaped = false;
  const open: string[] = [];
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[")
      open.push(character === "{" ? "}" : "]");
    else if (character === "}" || character === "]") open.pop();
  }
  if (!inString && !escaped && open.length === 0) return null;
  let suffix = "";
  // A dangling escape ends with an arbitrary escape; a newline stays valid.
  if (escaped) suffix += "n";
  if (inString) suffix += '"';
  return suffix + open.reverse().join("");
}

/** Parses JSON text, recovering records that storage truncated mid-string. */
export function parseTrajectoryJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  const direct = tryParseJson(trimmed);
  if (direct !== null) return direct;
  const suffix = truncatedJsonSuffix(trimmed);
  return suffix === null ? null : tryParseJson(trimmed + suffix);
}

export function formatTrajectoryDuration(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))}ms`;
  if (milliseconds < 10_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)}s`;
  const seconds = Math.round(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function formatTrajectorySize(characters: number) {
  if (characters < 1_024) return `${characters} B`;
  return `${(characters / 1_024).toFixed(characters < 10_240 ? 1 : 0)} KB`;
}

export function previewText(text: string, limit = 180) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit
    ? `${compact.slice(0, limit).trimEnd()}…`
    : compact;
}

function contentText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((block) => {
    if (typeof block === "string") return [block];
    if (
      block &&
      typeof block === "object" &&
      typeof (block as { text?: unknown }).text === "string"
    )
      return [(block as { text: string }).text];
    return [];
  });
  return parts.length ? parts.join("\n\n") : null;
}

function commandOutput(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, unknown>)
      : record;
  return typeof result.output === "string" ? result.output : null;
}

/** Model-facing text for a stored tool result, preserving legacy shapes. */
export function trajectoryToolOutput(payload: Record<string, unknown>) {
  if (payload.details && typeof payload.details === "object") {
    const command = commandOutput(payload.details);
    if (command !== null) return command;
  }
  if (typeof payload.details === "string") {
    const parsed = parseTrajectoryJson(payload.details);
    const command = parsed === null ? null : commandOutput(parsed);
    if (command !== null) return command;
  }
  const output = payload.output;
  if (typeof output === "string") {
    const parsed = parseTrajectoryJson(output);
    const command = parsed === null ? null : commandOutput(parsed);
    if (command !== null) return command;
    return output;
  }
  const content = contentText(output);
  if (content !== null) return content;
  if (output !== undefined) return formatTrajectoryValue(output);
  const payloadCommand = commandOutput(payload);
  if (payloadCommand !== null) return payloadCommand;
  if (bigString(payload.error)) return stringValue(payload.error);
  if (payload.details !== undefined)
    return formatTrajectoryValue(payload.details);
  return "";
}

function bigString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function primaryToolInput(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of [
    "command",
    "path",
    "file_path",
    "query",
    "pattern",
    "url",
  ]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  if (Array.isArray(record.paths) && typeof record.paths[0] === "string")
    return record.paths[0] as string;
  return "";
}

function toolInput(payload: Record<string, unknown>) {
  const input = payload.input;
  if (input === undefined) return "";
  return typeof input === "string" ? input : formatTrajectoryValue(input);
}

function toolInputSummary(payload: Record<string, unknown>, name: string) {
  if (name.startsWith("complete_")) {
    const input = payload.input;
    if (input === undefined) return "structured result";
    return `${formatTrajectorySize(JSON.stringify(input).length)} JSON result`;
  }
  const primary = primaryToolInput(payload.input);
  if (primary) return primary;
  const input = payload.input;
  if (input && typeof input === "object" && Object.keys(input).length > 0)
    return previewText(formatTrajectoryValue(input), 160);
  return "";
}

function tokenUsage(value: unknown): TrajectoryTokenUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Record<string, unknown>;
  const input = numberValue(usage.input) ?? 0;
  const output = numberValue(usage.output) ?? 0;
  const totalTokens = numberValue(usage.totalTokens) ?? 0;
  const cacheRead = numberValue(usage.cacheRead) ?? 0;
  const cacheWrite = numberValue(usage.cacheWrite) ?? 0;
  const total = totalTokens || input + output;
  if (!input && !output && !total) return null;
  return { input, output, total, cacheRead, cacheWrite };
}

function addTokenUsage(
  total: TrajectoryTokenUsage,
  usage: TrajectoryTokenUsage | null | undefined,
) {
  if (!usage) return total;
  total.input += usage.input;
  total.output += usage.output;
  total.total += usage.total;
  total.cacheRead += usage.cacheRead;
  total.cacheWrite += usage.cacheWrite;
  return total;
}

function emptyTokenUsage(): TrajectoryTokenUsage {
  return {
    input: 0,
    output: 0,
    total: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
}

function assistantToolCallNames(content: unknown) {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "toolCall" &&
      typeof (block as { name?: unknown }).name === "string"
    )
      return [(block as { name: string }).name];
    return [];
  });
}

function tagFor(kind: TrajectoryKind) {
  switch (kind) {
    case "system":
      return "SYSTEM";
    case "user":
      return "USER";
    case "context":
      return "CONTEXT";
    case "assistant":
      return "ASSISTANT";
    case "reasoning":
      return "THINKING";
    case "tool":
      return "TOOL";
    case "result":
      return "RESULT";
    case "request":
      return "REQUEST";
    case "model_request":
      return "REQUEST";
    case "notice":
      return "NOTICE";
    case "error":
      return "ERROR";
  }
}

function kindForItem(item: HarnessItem): TrajectoryKind {
  if (item.type === "user_message") return "user";
  if (item.type === "assistant_message") return "assistant";
  if (item.type === "reasoning") return "reasoning";
  if (item.type === "error") return "error";
  if (item.type === "approval_request" || item.type === "user_input_request")
    return "request";
  if (item.type === "system_notice") {
    const kind = item.payload.kind;
    if (kind === "prompt_snapshot") return "system";
    if (kind === "run_context") return "context";
    return "notice";
  }
  if (item.title?.startsWith("complete_")) return "result";
  if (
    [
      "command_execution",
      "file_change",
      "file_read",
      "file_search",
      "web_search",
      "tool_call",
    ].includes(item.type)
  )
    return "tool";
  return "notice";
}

function promptSnapshot(payload: Record<string, unknown>) {
  return {
    systemPrompt:
      typeof payload.systemPrompt === "string"
        ? payload.systemPrompt
        : undefined,
    context: typeof payload.context === "string" ? payload.context : undefined,
    tools: Array.isArray(payload.tools)
      ? (payload.tools.filter(
          (tool): tool is TrajectoryToolSnapshot =>
            Boolean(tool) &&
            typeof tool === "object" &&
            typeof (tool as { name?: unknown }).name === "string",
        ) as TrajectoryToolSnapshot[])
      : undefined,
  } satisfies TrajectoryPromptSnapshot;
}

function toolDetail(item: HarnessItem): TrajectoryTool {
  const payload = item.payload;
  const name = item.title ?? "tool";
  const startedAt = isoTime(item.startedAt);
  const completedAt = isoTime(item.completedAt);
  const output = trajectoryToolOutput(payload);
  const details =
    payload.details && typeof payload.details === "object"
      ? (payload.details as Record<string, unknown>)
      : undefined;
  const exitCode =
    numberValue(payload.exitCode) ?? numberValue(details?.exitCode);
  const durationMs =
    numberValue(payload.durationMs) ??
    (startedAt !== null && completedAt !== null
      ? Math.max(0, completedAt - startedAt)
      : null);
  return {
    name,
    input: toolInput(payload),
    inputSummary: toolInputSummary(payload, name),
    output,
    outputSummary: previewText(output, 200),
    exitCode,
    durationMs,
    details: payload.details,
    isError: item.status === "failed" || payload.isError === true,
    truncated: payload._truncated === true,
  };
}

function summarizeRow(
  item: HarnessItem,
  kind: TrajectoryKind,
  tool: TrajectoryTool | undefined,
  threadKind: string,
) {
  if (kind === "user") {
    const text =
      threadKind === "project_scaffold"
        ? setupMessageText(item.text)
        : item.text;
    return { summary: previewText(text ?? ""), preview: "" };
  }
  if (kind === "system") {
    const prompt = promptSnapshot(item.payload);
    const toolCount = prompt.tools?.length ?? 0;
    const promptChars = prompt.systemPrompt?.length ?? 0;
    return {
      summary: `System prompt · ${toolCount} tool${toolCount === 1 ? "" : "s"} · ${formatTrajectorySize(promptChars)}`,
      preview: previewText(prompt.systemPrompt ?? "", 180),
    };
  }
  if (kind === "context") {
    const prompt = promptSnapshot(item.payload);
    return {
      summary: "Run context",
      preview: previewText(prompt.context ?? "", 220),
    };
  }
  if (kind === "assistant") {
    const text = item.text?.trim() ?? "";
    if (text) return { summary: previewText(text), preview: "" };
    const calls = assistantToolCallNames(item.payload.content);
    return {
      summary: `Requested ${calls.length} tool call${calls.length === 1 ? "" : "s"}`,
      preview: calls.join(" · "),
    };
  }
  if (kind === "reasoning") {
    return { summary: previewText(item.text ?? "Reasoning"), preview: "" };
  }
  if (kind === "tool" || kind === "result") {
    const name = tool?.name ?? item.title ?? "tool";
    return {
      summary: [name, tool?.inputSummary].filter(Boolean).join(" "),
      preview: tool?.outputSummary ?? "",
    };
  }
  if (kind === "request") {
    const prompt = stringValue(item.payload.prompt) || item.text || "";
    const decision = stringValue(item.payload.decision);
    return {
      summary: previewText(prompt || "Input requested", 160),
      preview: decision
        ? `Decision: ${decision}`
        : item.status === "pending"
          ? "Waiting for a response"
          : "",
    };
  }
  if (kind === "error") {
    return {
      summary: item.text ?? item.title ?? "The run failed.",
      preview: "",
    };
  }
  return {
    summary: previewText(item.text ?? item.title ?? "Notice", 180),
    preview: "",
  };
}

function searchText(
  item: HarnessItem,
  kind: TrajectoryKind,
  tag: string,
  summary: string,
  preview: string,
  tool: TrajectoryTool | undefined,
  prompt: TrajectoryPromptSnapshot | undefined,
) {
  return [
    kind,
    tag,
    item.type,
    item.title,
    item.text,
    summary,
    preview,
    tool?.name,
    tool?.inputSummary,
    tool?.output,
    prompt?.systemPrompt?.slice(0, 4_000),
    prompt?.context?.slice(0, 4_000),
    ...(prompt?.tools ?? []).flatMap((entry) => [
      entry.name,
      entry.label,
      entry.description,
    ]),
    stringValue(item.payload.prompt),
    stringValue(item.payload.decision),
    stringValue(item.payload.answer),
    stringValue(item.payload.error),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .slice(0, 12_000)
    .toLowerCase();
}

function rowForItem(
  item: HarnessItem,
  turn: TrajectoryTurnDetail,
  attemptOrdinal: number | null,
  threadKind: string,
): TrajectoryRow {
  const kind = kindForItem(item);
  const tool =
    kind === "tool" || kind === "result" ? toolDetail(item) : undefined;
  const prompt =
    kind === "system" || kind === "context"
      ? promptSnapshot(item.payload)
      : undefined;
  const tag = tagFor(kind);
  const { summary, preview } = summarizeRow(item, kind, tool, threadKind);
  const startedAt = isoTime(item.startedAt) ?? isoTime(item.createdAt);
  const completedAt = isoTime(item.completedAt);
  const durationMs =
    kind === "user" ||
    kind === "system" ||
    kind === "context" ||
    kind === "notice"
      ? null
      : (numberValue(item.payload.durationMs) ??
        tool?.durationMs ??
        (startedAt !== null && completedAt !== null
          ? Math.max(0, completedAt - startedAt)
          : null));
  return {
    id: item.id,
    ordinal: item.ordinal,
    kind,
    tag,
    status: item.status,
    title: item.title,
    summary,
    preview,
    search: searchText(item, kind, tag, summary, preview, tool, prompt),
    tool,
    item,
    prompt,
    tokens:
      kind === "assistant"
        ? (tokenUsage(item.payload.usage) ?? undefined)
        : undefined,
    startedAt,
    completedAt,
    durationMs,
    error:
      kind === "error" ? (item.text ?? item.title ?? undefined) : undefined,
    decision: stringValue(item.payload.decision) || undefined,
    isCompletion: item.title?.startsWith("complete_") ?? false,
    turnId: turn.id,
    turnOrdinal: turn.ordinal,
    attemptOrdinal,
  };
}

function attemptRows(
  turn: TrajectoryTurnDetail,
  items: HarnessItem[],
  attempt: HarnessTurnAttempt | undefined,
  threadKind: string,
): TrajectoryAttemptModel {
  const projected = [...items]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((item) =>
      rowForItem(item, turn, attempt?.ordinal ?? null, threadKind),
    );
  // The request opens with the system prompt and run context; display the
  // setup records before the conversation without rewriting stored order.
  const rows = [
    ...projected.filter(
      (row) => row.kind === "system" || row.kind === "context",
    ),
    ...projected.filter(
      (row) => row.kind !== "system" && row.kind !== "context",
    ),
  ];
  const starts = rows
    .map((row) => row.startedAt)
    .filter((value): value is number => value !== null);
  const ends = rows
    .map((row) => row.completedAt)
    .filter((value): value is number => value !== null);
  const startedAt =
    (attempt ? isoTime(attempt.startedAt) : null) ??
    (starts.length ? Math.min(...starts) : null);
  const completedAt =
    (attempt ? isoTime(attempt.completedAt) : null) ??
    (ends.length ? Math.max(...ends) : null);
  return {
    id: attempt?.id ?? `turn:${turn.id}:events`,
    ordinal: attempt?.ordinal ?? null,
    status: attempt?.status ?? turn.status,
    startedAt,
    completedAt,
    durationMs:
      startedAt !== null && completedAt !== null
        ? Math.max(0, completedAt - startedAt)
        : null,
    error: attempt?.errorMessage ?? undefined,
    rows,
  };
}

function turnTokens(
  rows: TrajectoryRow[],
  turn: TrajectoryTurnDetail,
): TrajectoryTokenUsage | null {
  const usage = emptyTokenUsage();
  let found = false;
  for (const row of rows) {
    if (!row.tokens) continue;
    found = true;
    addTokenUsage(usage, row.tokens);
  }
  if (found) return usage;
  const input = turn.inputTokens ?? 0;
  const output = turn.outputTokens ?? 0;
  const total = turn.totalTokens ?? 0;
  if (!input && !output && !total) return null;
  return {
    input,
    output,
    total: total || input + output,
    cacheRead: 0,
    cacheWrite: 0,
  };
}

function projectTurn(
  turn: TrajectoryTurnDetail,
  threadKind: string,
): TrajectoryTurnModel {
  const itemsByAttempt = new Map<string | null, HarnessItem[]>();
  for (const item of turn.items) {
    const key = item.attemptId ?? null;
    itemsByAttempt.set(key, [...(itemsByAttempt.get(key) ?? []), item]);
  }
  const attempts = turn.attempts.map((attempt) =>
    attemptRows(
      turn,
      itemsByAttempt.get(attempt.id) ?? [],
      attempt,
      threadKind,
    ),
  );
  const unassigned = itemsByAttempt.get(null) ?? [];
  if (unassigned.length)
    attempts.push(attemptRows(turn, unassigned, undefined, threadKind));
  const rows = attempts.flatMap((attempt) => attempt.rows);
  const startedAt =
    isoTime(turn.startedAt) ?? isoTime(turn.requestedAt) ?? null;
  const completedAt = isoTime(turn.completedAt);
  return {
    id: turn.id,
    ordinal: turn.ordinal,
    status: turn.status,
    model: turn.model,
    inputText: turn.inputText,
    startedAt,
    completedAt,
    durationMs:
      startedAt !== null && completedAt !== null
        ? Math.max(0, completedAt - startedAt)
        : null,
    tokens: turnTokens(rows, turn),
    toolCount: rows.filter(
      (row) => row.kind === "tool" || row.kind === "result",
    ).length,
    error: turn.errorMessage ?? undefined,
    attempts,
    rows,
  };
}

function runSetup(rows: TrajectoryRow[]): TrajectoryRunSetup | null {
  const systemRow = rows.find((row) => row.kind === "system");
  const contextRow = rows.find((row) => row.kind === "context");
  if (!systemRow?.item && !contextRow?.item) return null;
  const payload = systemRow?.item?.payload ?? {};
  const contextPayload = contextRow?.item?.payload ?? {};
  const tools = Array.isArray(payload.tools)
    ? payload.tools.filter(
        (tool): tool is TrajectoryToolSnapshot =>
          Boolean(tool) &&
          typeof tool === "object" &&
          typeof (tool as { name?: unknown }).name === "string",
      )
    : [];
  return {
    systemItemId: systemRow?.item?.id ?? null,
    systemPrompt: stringValue(payload.systemPrompt) || null,
    tools,
    userText: stringValue(payload.userText) || null,
    contextItemId: contextRow?.item?.id ?? null,
    context: stringValue(contextPayload.context) || null,
    truncated:
      payload._truncated === true || contextPayload._truncated === true,
  };
}

/** Latest timestamp available on the rows fed into a request. */
function lastSpanTime(span: TrajectoryRow[]): number | null {
  for (let index = span.length - 1; index >= 0; index -= 1) {
    const row = span.at(index);
    if (!row) continue;
    if (row.completedAt !== null) return row.completedAt;
    if (row.startedAt !== null) return row.startedAt;
  }
  return null;
}

/**
 * Reconstructs model request boundaries from the ledger: every assistant
 * reply closes one request that consumed the records since the previous
 * reply. An attempt still awaiting its reply exposes a running request.
 */
function projectRequests(
  turns: TrajectoryTurnModel[],
  active: boolean,
): {
  list: TrajectoryRequest[];
  byAssistantRow: Map<string, TrajectoryRequest>;
  byErrorRow: Map<string, TrajectoryRequest>;
  byAttempt: Map<string, TrajectoryRequest>;
} {
  const list: TrajectoryRequest[] = [];
  const byAssistantRow = new Map<string, TrajectoryRequest>();
  const byErrorRow = new Map<string, TrajectoryRequest>();
  const byAttempt = new Map<string, TrajectoryRequest>();
  const cumulative = emptyTokenUsage();
  let cumulativeStarted = false;
  let ordinal = 0;
  for (const turn of turns) {
    for (const attempt of turn.attempts) {
      const span: TrajectoryRow[] = [];
      const close = (
        assistant: TrajectoryRow | null,
        status: TrajectoryRequest["status"],
        completedAt: number | null,
        options: { error?: string; attachId?: string } = {},
      ) => {
        ordinal += 1;
        const payload = (assistant?.item?.payload ?? {}) as Record<
          string,
          unknown
        >;
        const tokens = assistant?.tokens ?? null;
        if (tokens) {
          addTokenUsage(cumulative, tokens);
          cumulativeStarted = true;
        }
        const request: TrajectoryRequest = {
          id: assistant
            ? `request:${assistant.id}`
            : `request:open:${attempt.id}`,
          ordinal,
          turnId: turn.id,
          turnOrdinal: turn.ordinal,
          attemptId: attempt.id,
          attemptOrdinal: attempt.ordinal,
          status,
          model: stringValue(payload.model) || turn.model,
          provider:
            typeof payload.provider === "string" ? payload.provider : null,
          stopReason:
            typeof payload.stopReason === "string" ? payload.stopReason : null,
          sentAt: assistant ? assistant.startedAt : lastSpanTime(span),
          completedAt,
          durationMs: assistant?.durationMs ?? null,
          tokens,
          cumulativeTokens: cumulativeStarted ? { ...cumulative } : null,
          toolCallCount: assistant
            ? assistantToolCallNames(assistant.item?.payload.content).length
            : 0,
          inputRows: [...span],
          assistantRow: assistant,
          error: options.error,
        };
        list.push(request);
        if (assistant) byAssistantRow.set(assistant.id, request);
        else if (options.attachId) byErrorRow.set(options.attachId, request);
        else byAttempt.set(attempt.id, request);
      };
      // System prompt and run context describe the run envelope, not one
      // request; they stay outside the request spans.
      for (const row of attempt.rows) {
        if (row.kind === "system" || row.kind === "context") continue;
        if (row.kind === "assistant") {
          close(
            row,
            row.status === "failed" ? "failed" : "completed",
            row.completedAt,
          );
          span.length = 0;
          continue;
        }
        if (row.kind === "error" && span.length) {
          close(null, "failed", row.completedAt, {
            error: row.error,
            attachId: row.id,
          });
          span.length = 0;
          continue;
        }
        span.push(row);
      }
      if (span.length) {
        close(
          null,
          active
            ? "running"
            : turn.status === "failed"
              ? "failed"
              : "cancelled",
          null,
        );
      }
    }
  }
  return { list, byAssistantRow, byErrorRow, byAttempt };
}

/** Synthetic inspector row for a model request band. */
export function requestRow(request: TrajectoryRequest): TrajectoryRow {
  return {
    id: request.id,
    ordinal: request.ordinal,
    kind: "model_request",
    tag: tagFor("model_request"),
    status: request.status,
    title: null,
    summary: `Request ${request.ordinal}`,
    preview: "",
    search: `request ${request.ordinal} ${request.model ?? ""}`
      .trim()
      .toLowerCase(),
    request,
    item: request.assistantRow?.item,
    tokens: request.tokens ?? undefined,
    startedAt: request.sentAt,
    completedAt: request.completedAt,
    durationMs: request.durationMs,
    error: request.error,
    turnId: request.turnId,
    turnOrdinal: request.turnOrdinal,
    attemptOrdinal: request.attemptOrdinal,
  };
}

export function projectTrajectory(
  detail: HarnessThreadDetail,
): TrajectoryDetailModel {
  const turns = detail.turns.map((turn) =>
    projectTurn(turn, detail.thread.kind),
  );
  const rows = turns.flatMap((turn) => turn.rows);
  const {
    list: requests,
    byAssistantRow,
    byErrorRow,
    byAttempt,
  } = projectRequests(turns, isActiveThreadStatus(detail.thread.status));
  const usage = emptyTokenUsage();
  let hasUsage = false;
  for (const turn of turns) {
    if (!turn.tokens) continue;
    hasUsage = true;
    addTokenUsage(usage, turn.tokens);
  }
  const starts = [
    isoTime(detail.thread.createdAt),
    ...turns.map((turn) => turn.startedAt),
  ].filter((value): value is number => value !== null);
  const ends = [
    isoTime(detail.thread.completedAt),
    ...rows.map((row) => row.completedAt),
  ].filter((value): value is number => value !== null);
  const startedAt = starts.length ? Math.min(...starts) : null;
  const completedAt =
    isoTime(detail.thread.completedAt) ??
    (ends.length ? Math.max(...ends) : null);
  return {
    thread: detail.thread,
    turns,
    rows,
    requests,
    requestsByAssistantRow: byAssistantRow,
    requestsByErrorRow: byErrorRow,
    pendingByAttempt: byAttempt,
    setup: runSetup(rows),
    stats: {
      turns: turns.length,
      records: rows.length,
      toolCalls: rows.filter(
        (row) => row.kind === "tool" || row.kind === "result",
      ).length,
      fileReads: rows.filter((row) => row.item?.type === "file_read").length,
      commands: rows.filter((row) => row.item?.type === "command_execution")
        .length,
      searches: rows.filter(
        (row) =>
          row.item?.type === "file_search" || row.item?.type === "web_search",
      ).length,
      reasoning: rows.filter((row) => row.kind === "reasoning").length,
      tokens: hasUsage ? usage : null,
      startedAt,
      completedAt,
      durationMs:
        startedAt !== null && completedAt !== null
          ? Math.max(0, completedAt - startedAt)
          : null,
    },
  };
}

export function rowMatchesQuery(row: TrajectoryRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return row.search.includes(normalized);
}

export function filterTrajectoryTurns(
  turns: TrajectoryTurnModel[],
  options: {
    query: string;
    showReasoning: boolean;
    showContext: boolean;
  },
) {
  let matchCount = 0;
  const filtered = turns.flatMap((turn) => {
    const attempts = turn.attempts.flatMap((attempt) => {
      const rows = attempt.rows.filter((row) => {
        if (!options.showReasoning && row.kind === "reasoning") return false;
        if (
          !options.showContext &&
          (row.kind === "system" || row.kind === "context")
        )
          return false;
        return rowMatchesQuery(row, options.query);
      });
      matchCount += rows.length;
      return rows.length ? [{ ...attempt, rows }] : [];
    });
    const rows = attempts.flatMap((attempt) => attempt.rows);
    return rows.length ? [{ ...turn, attempts, rows }] : [];
  });
  return { turns: filtered, matchCount };
}

/** Present captured context blocks as readable sections while keeping the raw record intact. */
export function trajectoryContextSections(text: string) {
  const sections: { name: string; text: string }[] = [];
  let end = 0;
  for (const match of text.matchAll(
    /^<(context|untrusted_context) name="([\w-]+)">\r?\n([\s\S]*?)\r?\n<\/\1>[ \t]*(?=\r?$)/gm,
  )) {
    const [block, , name, body] = match;
    if (text.slice(end, match.index).trim() || !name || body === undefined)
      return [];
    sections.push({ name, text: body });
    end = match.index + block.length;
  }
  return text.slice(end).trim() ? [] : sections;
}
