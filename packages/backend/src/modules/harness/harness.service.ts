import { and, eq, inArray } from "drizzle-orm";
import type {
  AgentPermissionMode,
  HarnessAttachment,
  HarnessItem,
  HarnessItemType,
  HarnessThread,
  HarnessThreadDetail,
  HarnessThreadSummary,
  HarnessTransport,
  HarnessTurn,
  HarnessTurnAttempt,
} from "@repo/backend/shared/contracts";
import { db } from "../../shared/database/db";
import { challenges, harnessItems } from "../../shared/database/schema";
import { AppError } from "../../shared/errors/app-error";
import {
  boundedHarnessValue,
  boundedValue,
  type StableAgentEvent,
} from "../ai/agent/events";
import {
  harnessModel,
  type HarnessItemRow,
  type HarnessThreadRow,
  type HarnessTurnAttemptRow,
  type HarnessTurnRow,
} from "./harness.model";
import type {
  HarnessItemInput,
  HarnessRunRequest,
  HarnessThreadStart,
  HarnessUsage,
} from "./types";

let permissionModeProvider: () => AgentPermissionMode = () =>
  "approval-required";
/** Local settings supplies the single app-wide mode. */
export function setHarnessPermissionModeProvider(
  provider: () => AgentPermissionMode,
) {
  permissionModeProvider = provider;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function threadValue(row: HarnessThreadRow): HarnessThread {
  return {
    id: row.id,
    profileId: row.profileId,
    kind: row.kind,
    title: row.title,
    status: row.status,
    challengeId: row.challengeId,
    parentThreadId: row.parentThreadId,
    transport: row.transport,
    connectionId: row.connectionId,
    model: row.model,
    reasoningEffort: row.reasoningEffort as HarnessThread["reasoningEffort"],
    runtimeMode: row.runtimeMode,
    nativeThreadId: row.nativeThreadId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

function turnValue(row: HarnessTurnRow): HarnessTurn {
  return {
    id: row.id,
    threadId: row.threadId,
    ordinal: row.ordinal,
    status: row.status,
    inputText: row.inputText,
    transport: row.transport,
    connectionId: row.connectionId,
    model: row.model,
    reasoningEffort: row.reasoningEffort as HarnessTurn["reasoningEffort"],
    runtimeMode: row.runtimeMode,
    nativeTurnId: row.nativeTurnId,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
  };
}

function attemptValue(row: HarnessTurnAttemptRow): HarnessTurnAttempt {
  return {
    id: row.id,
    turnId: row.turnId,
    ordinal: row.ordinal,
    status: row.status,
    nativeThreadId: row.nativeThreadId,
    nativeTurnId: row.nativeTurnId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    completedAt: iso(row.completedAt),
  };
}

function itemValue(
  row: HarnessItemRow,
  options: { transport?: boolean } = {},
): HarnessItem {
  const payload = row.payload ?? {};
  return {
    id: row.id,
    threadId: row.threadId,
    turnId: row.turnId,
    attemptId: row.attemptId,
    parentItemId: row.parentItemId,
    ordinal: row.ordinal,
    type: row.type,
    status: row.status as HarnessItem["status"],
    title: row.title,
    text: row.text,
    payload: options.transport
      ? ((boundedValue(payload) as Record<string, unknown> | null) ?? {})
      : payload,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asTransport(value: string): HarnessTransport {
  return value === "codex_cli" || value === "opencode_cli" ? value : "api";
}

function itemTypeForTool(name: string): HarnessItemType {
  switch (name) {
    case "run_project_command":
    case "run_command":
    case "shell":
      return "command_execution";
    case "create_project_file":
    case "edit_project_file":
    case "create_project_directory":
    case "create_file":
    case "write":
    case "edit_file":
    case "edit":
      return "file_change";
    case "read_project_file":
    case "read_file":
    case "read":
    case "read_submission_file":
    case "read_workspace_file":
      return "file_read";
    case "list_project_files":
    case "search_project_files":
    case "list_files":
    case "ls":
    case "search_files":
    case "grep":
    case "list_submission_files":
    case "search_submission":
    case "list_workspace_files":
      return "file_search";
    case "fetch_url":
      return "web_search";
    default:
      return "tool_call";
  }
}

/** The model-facing text in a tool result's content array. */
function contentText(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const parts = content.flatMap((block) => {
    if (typeof block === "string") return [block];
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: string }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    )
      return [(block as { text: string }).text];
    return [];
  });
  return parts.length ? parts.join("\n\n") : null;
}

function resultPayload(result: unknown): {
  output?: unknown;
  details?: unknown;
  exitCode?: number;
  status?: string;
  error?: unknown;
  isError?: boolean;
} {
  if (typeof result === "string") return { output: result };
  const value =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {};
  const content = contentText(result);
  return {
    output:
      content ??
      (typeof value.output === "string"
        ? value.output
        : Object.keys(value).length
          ? value
          : (result ?? undefined)),
    details: value.details,
    exitCode: typeof value.exitCode === "number" ? value.exitCode : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    error:
      typeof value.error === "object" && value.error ? value.error : undefined,
    ...(value.isError === true ? { isError: true } : {}),
  };
}

function assistantContent(message: unknown) {
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return Array.isArray(content) ? content : null;
}

function assistantText(message: unknown) {
  const content = assistantContent(message);
  if (!content) return "";
  return content
    .flatMap((block) =>
      block &&
      typeof block === "object" &&
      (block as { type?: string }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
        ? [(block as { text: string }).text]
        : [],
    )
    .join("");
}

function assistantUsage(message: unknown) {
  if (!message || typeof message !== "object") return null;
  const usage = (message as { usage?: unknown }).usage;
  return usage && typeof usage === "object"
    ? (usage as Record<string, unknown>)
    : null;
}

function messageValue(message: unknown, key: string) {
  if (!message || typeof message !== "object") return null;
  const value = (message as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function messageTimestamp(message: unknown) {
  if (!message || typeof message !== "object") return null;
  const timestamp = (message as { timestamp?: unknown }).timestamp;
  return typeof timestamp === "number" ? timestamp : null;
}

function messageDuration(message: unknown) {
  if (!message || typeof message !== "object") return null;
  const duration = (message as { durationMs?: unknown }).durationMs;
  return typeof duration === "number" ? duration : null;
}

type PendingRequest = {
  threadId: string;
  turnId: string;
  itemId: string;
  resolve: (decision: { decision: "allow" | "deny"; answer?: string }) => void;
  reject: (error: unknown) => void;
};
const pendingRequests = new Map<string, PendingRequest>();

class Recorder {
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string;
  private toolItems = new Map<string, string>();
  private eventQueue: Promise<void> = Promise.resolve();
  private messageStartedAt: number | null = null;
  private userItemId: string | null = null;

  constructor(input: { threadId: string; turnId: string; attemptId: string }) {
    this.threadId = input.threadId;
    this.turnId = input.turnId;
    this.attemptId = input.attemptId;
  }

  async append(input: HarnessItemInput) {
    const row = await harnessModel.appendItem({
      id: crypto.randomUUID(),
      threadId: this.threadId,
      turnId: this.turnId,
      attemptId: this.attemptId,
      parentItemId: null,
      type: input.type,
      status: input.status ?? "completed",
      title: input.title ?? null,
      text: input.text ?? null,
      payload: input.payload ?? {},
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
    });
    return itemValue(row);
  }

  async update(
    id: string,
    patch: {
      status?: HarnessItem["status"];
      title?: string | null;
      text?: string | null;
      payload?: Record<string, unknown>;
      completedAt?: Date | null;
    },
  ) {
    const row = await harnessModel.updateItem(id, {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
      ...(patch.completedAt !== undefined
        ? { completedAt: patch.completedAt }
        : {}),
    });
    return row ? itemValue(row) : null;
  }

  /** The turn start writes a summary; the prompt snapshot corrects it. */
  setUserItem(id: string) {
    this.userItemId = id;
  }

  event(event: StableAgentEvent) {
    // Agent subscriptions do not await database writes. Preserve emission order
    // so a fast tool's finish cannot overtake its asynchronously saved start.
    const saved = this.eventQueue.then(() => this.recordEvent(event));
    this.eventQueue = saved.catch(() => {});
    return saved;
  }

  private async recordEvent(event: StableAgentEvent) {
    if (event.type === "prompt_captured") {
      const at = new Date(event.at);
      const system = boundedHarnessValue(event.systemPrompt);
      const userText = boundedHarnessValue(event.userText);
      const tools = boundedHarnessValue(event.tools);
      const toolCount = event.tools.length;
      if (this.userItemId && typeof userText.value === "string") {
        const current = await harnessModel.findItem(this.userItemId);
        if (current && current.text !== userText.value)
          await this.update(this.userItemId, { text: userText.value });
      }
      await this.append({
        type: "system_notice",
        status: "completed",
        title: "System prompt and tools",
        text: `Run configuration · ${toolCount} tool${toolCount === 1 ? "" : "s"} offered.`,
        payload: {
          kind: "prompt_snapshot",
          systemPrompt: system.value,
          userText: userText.value,
          tools: tools.value,
          ...(system.truncated || tools.truncated || userText.truncated
            ? { _truncated: true }
            : {}),
        },
        startedAt: at,
      });
      if (event.context) {
        const context = boundedHarnessValue(event.context);
        await this.append({
          type: "system_notice",
          status: "completed",
          title: "Run context",
          text: "Run context captured.",
          payload: {
            kind: "run_context",
            context: context.value,
            ...(context.truncated ? { _truncated: true } : {}),
          },
          startedAt: at,
        });
      }
      return;
    }
    if (event.type === "message_started") {
      this.messageStartedAt = event.at;
      return;
    }
    if (event.type === "tool_started") {
      const item = await this.append({
        type: itemTypeForTool(event.toolName),
        status: "running",
        title: event.toolName,
        payload: {
          callId: event.toolCallId,
          input: event.args,
          ...(event.toolName.startsWith("complete_")
            ? { kind: "completion" }
            : {}),
          ...(event.argsTruncated ? { _truncated: true } : {}),
          ...(["run_project_command", "run_command", "shell"].includes(
            event.toolName,
          )
            ? {
                cwd:
                  event.args &&
                  typeof event.args === "object" &&
                  typeof (event.args as { cwd?: unknown }).cwd === "string"
                    ? (event.args as { cwd: string }).cwd
                    : ".",
              }
            : {}),
        },
        startedAt: new Date(),
      });
      this.toolItems.set(event.toolCallId, item.id);
      return;
    }
    if (event.type === "tool_finished") {
      const id = this.toolItems.get(event.toolCallId);
      if (!id) return;
      this.toolItems.delete(event.toolCallId);
      const current = await harnessModel.findItem(id);
      const result = resultPayload(event.result);
      await this.update(id, {
        status: event.isError ? "failed" : "completed",
        payload: {
          ...(current?.payload ?? {}),
          ...(result.output !== undefined ? { output: result.output } : {}),
          ...(result.details !== undefined ? { details: result.details } : {}),
          ...(result.exitCode !== undefined
            ? { exitCode: result.exitCode }
            : {}),
          ...(result.status !== undefined ? { status: result.status } : {}),
          ...(result.error !== undefined ? { error: result.error } : {}),
          ...(event.durationMs !== undefined
            ? { durationMs: event.durationMs }
            : {}),
          ...(event.isError || result.isError ? { isError: true } : {}),
          ...(event.resultTruncated ? { _truncated: true } : {}),
        },
        completedAt: new Date(),
      });
      return;
    }
    if (event.type === "message_completed") {
      const role = messageValue(event.message, "role");
      if (role !== "assistant") return;
      const timestamp = messageTimestamp(event.message);
      const duration = messageDuration(event.message);
      const startedAt = timestamp
        ? new Date(timestamp)
        : this.messageStartedAt
          ? new Date(this.messageStartedAt)
          : null;
      const completedAt =
        timestamp && duration !== null
          ? new Date(timestamp + duration)
          : timestamp
            ? new Date(timestamp)
            : new Date();
      const model = messageValue(event.message, "model");
      const provider = messageValue(event.message, "provider");
      const stopReason = messageValue(event.message, "stopReason");
      const usage = assistantUsage(event.message);
      if (event.reasoning)
        await this.append({
          type: "reasoning",
          text: event.reasoning,
          payload: {
            ...(model ? { model } : {}),
            ...(stopReason ? { stopReason } : {}),
            ...(duration !== null ? { durationMs: duration } : {}),
          },
          startedAt,
          completedAt,
        });
      const content = assistantContent(event.message);
      const bounded = content ? boundedHarnessValue(content) : null;
      const text = assistantText(event.message);
      const hasToolCalls =
        content?.some(
          (block) =>
            block &&
            typeof block === "object" &&
            (block as { type?: string }).type === "toolCall",
        ) ?? false;
      if (text || hasToolCalls)
        await this.append({
          type: "assistant_message",
          text: text || null,
          payload: {
            ...(model ? { model } : {}),
            ...(provider ? { provider } : {}),
            ...(stopReason ? { stopReason } : {}),
            ...(duration !== null ? { durationMs: duration } : {}),
            ...(usage ? { usage } : {}),
            ...(bounded ? { content: bounded.value } : {}),
            ...(bounded?.truncated ? { _truncated: true } : {}),
          },
          startedAt,
          completedAt,
        });
      this.messageStartedAt = null;
    }
  }

  async finish(input: {
    status: "completed" | "failed" | "cancelled" | "interrupted" | "waiting";
    usage?: HarnessUsage;
    error?: { code: string; message: string };
  }) {
    await this.eventQueue;
    const at = new Date();
    if (input.error)
      await this.append({
        type: "error",
        status: "completed",
        title: input.error.code,
        text: input.error.message,
        payload: input.error,
      });
    const attemptStatus = input.status === "waiting" ? "waiting" : input.status;
    await harnessModel.updateAttempt(this.attemptId, {
      status: attemptStatus,
      errorCode: input.error?.code ?? null,
      errorMessage: input.error?.message ?? null,
      ...(input.status === "waiting" ? {} : { completedAt: at }),
    });
    await harnessModel.updateTurn(this.turnId, {
      status: attemptStatus,
      ...(input.usage
        ? {
            inputTokens: input.usage.input,
            outputTokens: input.usage.output,
            totalTokens: input.usage.totalTokens,
          }
        : {}),
      errorCode: input.error?.code ?? null,
      errorMessage: input.error?.message ?? null,
      ...(input.status === "waiting" ? {} : { completedAt: at }),
    });
    await harnessModel.updateThread(this.threadId, {
      status: attemptStatus,
      errorCode: input.error?.code ?? null,
      errorMessage: input.error?.message ?? null,
      ...(input.status === "waiting" ? {} : { completedAt: at }),
    });
    if (input.status !== "waiting" && input.status !== "completed")
      await rejectPendingForThread(this.threadId, input.status);
  }
}

async function rejectPendingForThread(
  threadId: string,
  status: "failed" | "cancelled" | "interrupted",
) {
  for (const [requestId, pending] of pendingRequests) {
    if (pending.threadId !== threadId) continue;
    pendingRequests.delete(requestId);
    await harnessModel
      .updateItem(pending.itemId, {
        status: status === "cancelled" ? "cancelled" : "failed",
        completedAt: new Date(),
      })
      .catch(() => {});
    pending.reject(
      new AppError(
        status === "cancelled" ? "REQUEST_CANCELLED" : "HARNESS_INTERRUPTED",
        status === "cancelled"
          ? "The run was stopped before this request was answered."
          : "The run ended before this request was answered.",
        status === "cancelled" ? 499 : 409,
      ),
    );
  }
}

export type HarnessRecorder = Recorder;

export function createHarnessService() {
  function mode(explicit?: AgentPermissionMode) {
    return explicit ?? permissionModeProvider();
  }

  async function createThread(input: HarnessThreadStart) {
    const challengeId = input.challengeId
      ? ((
          await db
            .select({ id: challenges.id })
            .from(challenges)
            .where(eq(challenges.id, input.challengeId))
        )[0]?.id ?? null)
      : null;
    const row = await harnessModel.insertThread({
      id: crypto.randomUUID(),
      profileId: input.profileId,
      kind: input.kind,
      title: input.title,
      challengeId,
      parentThreadId: input.parentThreadId ?? null,
      transport: input.transport ?? "api",
      connectionId: input.connectionId ?? null,
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? null,
      runtimeMode: mode(input.runtimeMode),
    });
    if (!row)
      throw new AppError(
        "HARNESS_THREAD_UNAVAILABLE",
        "The run could not be recorded.",
        503,
        true,
      );
    return threadValue(row);
  }

  /** Read-only lookup used by features that own one durable transcript. */
  async function findThread(input: {
    profileId: string;
    challengeId: string;
    kind: string;
  }) {
    const row = await harnessModel.findThreadForChallenge(
      input.profileId,
      input.challengeId,
      input.kind,
    );
    return row ? threadValue(row) : null;
  }

  /** Attach a generation transcript to the challenge it produced. */
  async function linkChallenge(threadId: string, challengeId: string) {
    const row = await harnessModel.linkThreadChallenge(threadId, challengeId);
    return row ? threadValue(row) : null;
  }

  async function appendTurn(
    threadId: string,
    input: {
      inputText: string;
      runtimeMode?: AgentPermissionMode;
      transport?: HarnessTransport;
      connectionId?: string | null;
      model?: string;
      reasoningEffort?: string | null;
    },
  ) {
    const thread = await harnessModel.findThread(threadId);
    if (!thread) throw new AppError("HARNESS_NOT_FOUND", "Run not found.", 404);
    const row = await harnessModel.appendTurn({
      id: crypto.randomUUID(),
      threadId,
      inputText: input.inputText,
      transport: input.transport ?? thread.transport,
      connectionId: input.connectionId ?? thread.connectionId,
      model: input.model ?? thread.model,
      reasoningEffort: input.reasoningEffort ?? thread.reasoningEffort,
      runtimeMode: mode(input.runtimeMode ?? thread.runtimeMode),
    });
    return turnValue(row);
  }

  async function begin(input: {
    threadId: string;
    turnId?: string;
    inputText: string;
    runtimeMode?: AgentPermissionMode;
    model?: string;
    connectionId?: string;
    reasoningEffort?: string | null;
  }) {
    const thread = await harnessModel.findThread(input.threadId);
    if (!thread) throw new AppError("HARNESS_NOT_FOUND", "Run not found.", 404);
    let turn = input.turnId
      ? await harnessModel.findTurn(input.turnId)
      : await harnessModel
          .findLatestTurn(thread.id)
          .then((latest) =>
            latest &&
            (latest.status === "queued" || latest.status === "interrupted")
              ? latest
              : undefined,
          );
    if (turn && turn.threadId !== thread.id)
      throw new AppError(
        "HARNESS_TURN_MISMATCH",
        "This turn belongs to another run.",
        409,
      );
    if (!turn)
      turn = await harnessModel.appendTurn({
        id: crypto.randomUUID(),
        threadId: thread.id,
        inputText: input.inputText,
        transport: thread.transport,
        connectionId: thread.connectionId,
        model: thread.model,
        reasoningEffort: thread.reasoningEffort,
        runtimeMode: mode(input.runtimeMode ?? thread.runtimeMode),
      });
    // The turn is the permission snapshot. Queued turns pick up the current
    // Settings value at start; a running or waiting turn keeps the mode it
    // started with, so Settings changes never retract a pending approval.
    const runtimeMode =
      input.runtimeMode ??
      (turn.status === "queued" ? mode() : turn.runtimeMode);
    const at = new Date();
    const resolved = input.model
      ? {
          model: input.model,
          connectionId: input.connectionId ?? thread.connectionId,
          reasoningEffort: input.reasoningEffort ?? null,
        }
      : {};
    await harnessModel.updateThread(thread.id, {
      ...resolved,
      status: "running",
      runtimeMode,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
    });
    await harnessModel.updateTurn(turn.id, {
      ...resolved,
      status: "running",
      runtimeMode,
      startedAt: at,
    });
    const attempt = await harnessModel.appendAttempt({
      id: crypto.randomUUID(),
      turnId: turn.id,
      at,
    });
    const recorder = new Recorder({
      threadId: thread.id,
      turnId: turn.id,
      attemptId: attempt.id,
    });
    const userItem = await recorder.append({
      type: "user_message",
      status: "completed",
      text: input.inputText,
      payload: {},
    });
    recorder.setUserItem(userItem.id);
    return {
      thread: threadValue((await harnessModel.findThread(thread.id))!),
      turn: turnValue((await harnessModel.findTurn(turn.id))!),
      attempt: attemptValue(attempt),
      recorder,
    };
  }

  /** Start a run that no feature explicitly created (enhancement, resume, title). */
  async function beginAutomatic(input: {
    profileId: string;
    kind: string;
    title: string;
    challengeId?: string | null;
    model: string;
    reasoningEffort?: string | null;
    inputText: string;
  }) {
    const thread = await createThread({
      profileId: input.profileId,
      kind: input.kind,
      title: input.title,
      challengeId: input.challengeId ?? null,
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? null,
      transport: "api",
    });
    return begin({
      threadId: thread.id,
      inputText: input.inputText,
    });
  }

  async function appendItem(
    threadId: string,
    turnId: string | null,
    input: HarnessItemInput,
  ) {
    const row = await harnessModel.appendItem({
      id: crypto.randomUUID(),
      threadId,
      turnId,
      attemptId: null,
      parentItemId: null,
      type: input.type,
      status: input.status ?? "completed",
      title: input.title ?? null,
      text: input.text ?? null,
      payload: input.payload ?? {},
      startedAt: input.startedAt ?? null,
    });
    return itemValue(row);
  }

  async function updateItem(
    id: string,
    patch: {
      status?: HarnessItem["status"];
      title?: string | null;
      text?: string | null;
      payload?: Record<string, unknown>;
      completedAt?: Date | null;
    },
  ) {
    const row = await harnessModel.updateItem(id, {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
      ...(patch.completedAt !== undefined
        ? { completedAt: patch.completedAt }
        : {}),
    });
    return row ? itemValue(row) : null;
  }

  async function request(input: {
    threadId: string;
    turnId: string;
    type: "approval_request" | "user_input_request";
    kind: string;
    prompt: string;
    options?: string[];
    signal?: AbortSignal;
  }) {
    const requestId = crypto.randomUUID();
    const item = await appendItem(input.threadId, input.turnId, {
      type: input.type,
      status: "pending",
      title: input.kind,
      text: input.prompt,
      payload: {
        requestId,
        kind: input.kind,
        prompt: input.prompt,
        ...(input.options ? { options: input.options } : {}),
      },
    });
    await harnessModel.updateThread(input.threadId, { status: "waiting" });
    await harnessModel.updateTurn(input.turnId, { status: "waiting" });
    return new Promise<{ decision: "allow" | "deny"; answer?: string }>(
      (resolve, reject) => {
        const onAbort = () => {
          pendingRequests.delete(requestId);
          void updateItem(item.id, {
            status: "cancelled",
            payload: {
              requestId,
              kind: input.kind,
              prompt: input.prompt,
              decision: "deny",
            },
            completedAt: new Date(),
          });
          reject(
            new AppError(
              "REQUEST_CANCELLED",
              "The request was cancelled.",
              499,
            ),
          );
        };
        if (input.signal?.aborted) {
          onAbort();
          return;
        }
        input.signal?.addEventListener("abort", onAbort, { once: true });
        pendingRequests.set(requestId, {
          threadId: input.threadId,
          turnId: input.turnId,
          itemId: item.id,
          resolve: (value) => {
            input.signal?.removeEventListener("abort", onAbort);
            resolve(value);
          },
          reject: (error) => {
            input.signal?.removeEventListener("abort", onAbort);
            reject(error);
          },
        });
      },
    );
  }

  /** Record a clarification that the user must answer before work continues. */
  async function requestInput(
    threadId: string,
    input: { kind: string; prompt: string; options?: string[] },
  ) {
    const turn = await harnessModel.findLatestTurn(threadId);
    if (!turn) return null;
    const requestId = crypto.randomUUID();
    const item = await appendItem(threadId, turn.id, {
      type: "user_input_request",
      status: "pending",
      title: input.kind,
      text: input.prompt,
      payload: {
        requestId,
        kind: input.kind,
        prompt: input.prompt,
        ...(input.options ? { options: input.options } : {}),
      },
    });
    await harnessModel.updateThread(threadId, {
      status: "waiting",
      completedAt: null,
    });
    await harnessModel.updateTurn(turn.id, {
      status: "waiting",
      completedAt: null,
    });
    return item;
  }

  async function answerPendingInput(threadId: string, answer: string) {
    const items = await harnessModel.findItems(threadId);
    const item = [...items]
      .reverse()
      .find(
        (entry) =>
          entry.type === "user_input_request" && entry.status === "pending",
      );
    if (!item) return null;
    const updated = await harnessModel.updateItem(item.id, {
      status: "completed",
      payload: { ...(item.payload ?? {}), answer },
      completedAt: new Date(),
    });
    await harnessModel.updateThread(threadId, { status: "running" });
    if (item.turnId)
      await harnessModel.updateTurn(item.turnId, { status: "running" });
    return updated ? itemValue(updated) : null;
  }

  async function appendAssistant(threadId: string, text: string) {
    const turn = await harnessModel.findLatestTurn(threadId);
    if (!turn) return null;
    return appendItem(threadId, turn.id, {
      type: "assistant_message",
      status: "completed",
      text,
      payload: {},
    });
  }

  async function resolveRequest(
    threadId: string,
    profileId: string,
    requestId: string,
    decision: { decision: "allow" | "deny"; answer?: string },
  ) {
    const thread = await harnessModel.findThreadOwned(threadId, profileId);
    if (!thread) throw new AppError("HARNESS_NOT_FOUND", "Run not found.", 404);
    const items = await harnessModel.findItems(threadId);
    const item = items.find(
      (entry) =>
        (entry.type === "approval_request" ||
          entry.type === "user_input_request") &&
        entry.payload?.requestId === requestId,
    );
    if (!item)
      throw new AppError(
        "HARNESS_REQUEST_NOT_FOUND",
        "Request not found.",
        404,
      );
    if ((item.payload as { requestId?: string }).requestId !== requestId)
      throw new AppError(
        "HARNESS_REQUEST_NOT_FOUND",
        "Request not found.",
        404,
      );
    if (item.status !== "pending") return itemValue(item);
    const payload = {
      ...(item.payload ?? {}),
      ...(decision.answer !== undefined ? { answer: decision.answer } : {}),
      decision: decision.decision,
    };
    const updated = await harnessModel.updateItem(item.id, {
      status: "completed",
      payload,
      completedAt: new Date(),
    });
    await harnessModel.updateThread(threadId, { status: "running" });
    if (item.turnId)
      await harnessModel.updateTurn(item.turnId, { status: "running" });
    const pending = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    pending?.resolve(decision);
    return itemValue(updated!);
  }

  /** One full record, including payloads trimmed from the thread detail. */
  async function item(threadId: string, itemId: string, profileId: string) {
    const thread = await harnessModel.findThreadOwned(threadId, profileId);
    if (!thread) throw new AppError("HARNESS_NOT_FOUND", "Run not found.", 404);
    const row = await harnessModel.findItem(itemId);
    if (!row || row.threadId !== threadId)
      throw new AppError("HARNESS_ITEM_NOT_FOUND", "Record not found.", 404);
    return itemValue(row);
  }

  async function detail(threadId: string, profileId: string) {
    const thread = await harnessModel.findThreadOwned(threadId, profileId);
    if (!thread) throw new AppError("HARNESS_NOT_FOUND", "Run not found.", 404);
    const turns = await harnessModel.findTurns(threadId);
    const items = await harnessModel.findItems(threadId);
    const attempts = await Promise.all(
      turns.map((turn) => harnessModel.findAttempts(turn.id)),
    );
    const itemsByTurn = new Map<string, HarnessItem[]>();
    const turnsById = new Map(turns.map((turn) => [turn.id, turn]));
    for (const item of items) {
      const key = item.turnId ?? "";
      const value = itemValue(item, { transport: true });
      const turn = item.turnId ? turnsById.get(item.turnId) : undefined;
      // Older transcripts may have lost a tool-finished update. A terminal
      // turn cannot still have live tools; project the status without rewriting
      // saved history or pretending an unfinished non-completion tool succeeded.
      if (
        turn &&
        ["completed", "failed", "cancelled", "interrupted"].includes(
          turn.status,
        ) &&
        (value.status === "running" || value.status === "pending")
      ) {
        value.status =
          turn.status === "completed" && value.title?.startsWith("complete_")
            ? "completed"
            : turn.status === "failed"
              ? "failed"
              : "cancelled";
        value.completedAt = iso(turn.completedAt);
      }
      itemsByTurn.set(key, [...(itemsByTurn.get(key) ?? []), value]);
    }
    return {
      thread: threadValue(thread),
      turns: turns.map((turn, index) => ({
        ...turnValue(turn),
        attempts: attempts[index]!.map(attemptValue),
        items: itemsByTurn.get(turn.id) ?? [],
      })),
      attachments: (await harnessModel.findAttachments(threadId)).map(
        (row) =>
          ({
            id: row.id,
            threadId: row.threadId,
            turnId: row.turnId,
            itemId: row.itemId,
            direction: row.direction,
            kind: row.kind,
            name: row.name,
            mime: row.mime,
            bytes: row.bytes,
            sha256: row.sha256,
            path: row.path,
            url: row.url,
            createdAt: row.createdAt.toISOString(),
          }) satisfies HarnessAttachment,
      ),
    } satisfies HarnessThreadDetail;
  }

  async function list(
    profileId: string,
    filter: { kind?: string; challengeId?: string; limit?: number },
  ): Promise<HarnessThreadSummary[]> {
    const rows = await harnessModel.listThreads(profileId, {
      ...filter,
      limit: Math.min(filter.limit ?? 50, 1_000),
    });
    const counts = await harnessModel.countsForThreads(
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      ...threadValue(row),
      turnCount: counts.get(row.id)?.turns ?? 0,
      itemCount: counts.get(row.id)?.items ?? 0,
    }));
  }

  async function stop(threadId: string, profileId: string) {
    const thread = await harnessModel.findThreadOwned(threadId, profileId);
    if (!thread) throw new AppError("HARNESS_NOT_FOUND", "Run not found.", 404);
    if (
      ["completed", "failed", "cancelled", "interrupted"].includes(
        thread.status,
      )
    )
      return threadValue(thread);
    await rejectPendingForThread(threadId, "cancelled");
    const at = new Date();
    const turns = await harnessModel.findTurns(threadId);
    for (const turn of turns) {
      if (["queued", "running", "waiting"].includes(turn.status)) {
        await harnessModel.updateTurn(turn.id, {
          status: "cancelled",
          completedAt: at,
          errorCode: "HARNESS_CANCELLED",
          errorMessage: "This run was stopped.",
        });
        const attempts = await harnessModel.findAttempts(turn.id);
        for (const attempt of attempts) {
          if (["queued", "running", "waiting"].includes(attempt.status))
            await harnessModel.updateAttempt(attempt.id, {
              status: "cancelled",
              completedAt: at,
              errorCode: "HARNESS_CANCELLED",
              errorMessage: "This run was stopped.",
            });
        }
      }
    }
    await db
      .update(harnessItems)
      .set({ status: "cancelled", completedAt: at, updatedAt: at })
      .where(
        and(
          eq(harnessItems.threadId, threadId),
          inArray(harnessItems.status, ["pending", "running"]),
        ),
      );
    const updated = await harnessModel.updateThread(threadId, {
      status: "cancelled",
      completedAt: at,
      errorCode: "HARNESS_CANCELLED",
      errorMessage: "This run was stopped.",
    });
    return threadValue(updated!);
  }

  async function retry(threadId: string, profileId: string) {
    const thread = await harnessModel.findThreadOwned(threadId, profileId);
    if (!thread) throw new AppError("HARNESS_NOT_FOUND", "Run not found.", 404);
    const last = await harnessModel.findLatestTurn(threadId);
    if (!last)
      throw new AppError(
        "HARNESS_NOT_RETRYABLE",
        "This run has no turn to retry.",
        409,
      );
    if (!["failed", "cancelled", "interrupted"].includes(last.status))
      throw new AppError(
        "HARNESS_NOT_RETRYABLE",
        "Only a failed, stopped, or interrupted turn can be retried.",
        409,
      );
    const turn = await appendTurn(threadId, { inputText: last.inputText });
    await harnessModel.updateThread(threadId, {
      status: "queued",
      errorCode: null,
      errorMessage: null,
      completedAt: null,
    });
    return turn;
  }

  async function recover() {
    for (const [requestId, pending] of pendingRequests) {
      pendingRequests.delete(requestId);
      pending.reject(
        new AppError(
          "HARNESS_INTERRUPTED",
          "The app stopped before this request was answered.",
          409,
        ),
      );
    }
    await harnessModel.interruptRunning();
  }

  return {
    createThread,
    findThread,
    linkChallenge,
    appendTurn,
    begin,
    beginAutomatic,
    appendItem,
    updateItem,
    request,
    requestInput,
    answerPendingInput,
    appendAssistant,
    resolveRequest,
    item,
    detail,
    list,
    stop,
    retry,
    recover,
    currentRuntimeMode: () => permissionModeProvider(),
    asTransport,
  };
}

export type HarnessService = ReturnType<typeof createHarnessService>;
export const harnessService = createHarnessService();
export { itemValue, threadValue, turnValue };
