import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { AppError } from "../../../shared/errors/app-error";
import { providerError } from "../../../local/providers/common";
import type { Manifest } from "../../projects/snapshot";
import {
  createCompletionTool,
  createResearchWorkspace,
  createTaskTools,
  recordCompletionFailure,
  removeResearchWorkspace,
  type CompletionSpec,
  type CompletionState,
} from "./tools";
import { stableEvent, type StableAgentEvent } from "./events";
import { systemPrompt, userMessage } from "./messages";
import type { MessageAttachment } from "../../messages/message.schema";
import type { ResolvedAgentModel } from "./providers";

const AGENT_LIMITS = {
  maxTurns: 12,
  maxToolCalls: 24,
  maxRepairs: 2,
  maxTextChars: 32_000,
} as const;

type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
};

type BaseRunOptions = {
  resolved: ResolvedAgentModel;
  instructions: string;
  history?: AgentMessage[];
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (event: StableAgentEvent) => void | Promise<void>;
};

type StructuredRunOptions<T> = BaseRunOptions & {
  context: string;
  userText: string;
  attachments?: MessageAttachment[];
  completion: CompletionSpec<T>;
  allowSnapshot: boolean;
  allowResearch?: boolean;
  workspace?: string;
  manifest?: Manifest;
};

type TextRunOptions = BaseRunOptions & {
  context?: string;
  userText: string;
  attachments?: MessageAttachment[];
};

export type StructuredRunResult<T> = {
  value: T;
  usage: UsageTotals;
  turnCount: number;
  toolCallCount: number;
  messages: AgentMessage[];
};

function emptyUsage(): UsageTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
}

function addUsage(total: UsageTotals, message: AssistantMessage) {
  total.input += message.usage.input;
  total.output += message.usage.output;
  total.cacheRead += message.usage.cacheRead;
  total.cacheWrite += message.usage.cacheWrite;
  total.totalTokens += message.usage.totalTokens;
}

function assistantMessages(messages: AgentMessage[]) {
  return messages.filter(
    (message): message is AssistantMessage => message.role === "assistant",
  );
}

function statusFromMessage(message: AssistantMessage) {
  const diagnostic = message.diagnostics?.find(
    (entry) => entry.error?.code || entry.error?.message,
  );
  const text = [message.errorMessage, diagnostic?.error?.message]
    .filter(Boolean)
    .join(" ");
  const status =
    /\b(?:status|http)\D{0,12}(4\d\d|5\d\d)\b/i.exec(text)?.[1] ??
    /\b(401|403|404|408|422|429|500|502|503|504)\b/.exec(text)?.[1];
  const code = diagnostic?.error?.code;
  return {
    status: status ? Number(status) : undefined,
    code: typeof code === "string" ? code : undefined,
  };
}

function failureFor(message: AssistantMessage, providerName: string) {
  const details = statusFromMessage(message);
  return providerError(
    {
      status: details.status,
      code: details.code,
    },
    providerName,
  );
}

function collectText(messages: AgentMessage[]) {
  let text = "";
  for (const message of assistantMessages(messages))
    for (const block of message.content)
      if (block.type === "text") text += block.text;
  return text;
}

async function runAgent(input: {
  options: BaseRunOptions;
  text: string;
  context?: string;
  attachments?: MessageAttachment[];
  tools: AgentTool[];
  completion?: CompletionSpec<unknown>;
  streamText: boolean;
  requireImageSupport?: boolean;
  onText?: (delta: string) => void | Promise<void>;
}) {
  const { options } = input;
  const { resolved } = options;
  const signal = options.signal;
  const toolNames = new Set([
    ...input.tools.map((tool) => tool.name),
    ...(input.completion ? [input.completion.name] : []),
  ]);
  let turnCount = 0;
  let toolCallCount = 0;
  let limitError: AppError | undefined;
  let timedOut = false;
  let textChars = { value: 0 };
  let receivedText = false;

  const completionState: CompletionState<unknown> | undefined = input.completion
    ? { failures: 0 }
    : undefined;
  const completionTool = completionState
    ? createCompletionTool(input.completion!, completionState)
    : undefined;
  const tools = completionTool ? [completionTool, ...input.tools] : input.tools;

  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt({
        instructions: options.instructions,
        completionTool: input.completion?.name,
      }),
      model: resolved.model,
      thinkingLevel: resolved.thinkingLevel,
      tools,
      messages: options.history ?? [],
    },
    streamFn: (model, context, streamOptions) =>
      resolved.streamFn(model, context, {
        ...streamOptions,
        maxRetries: 0,
      }),
    identity: { attribution: null },
    convertToLlm: (messages) => messages as Message[],
    toolExecution: "sequential",
    sessionId: crypto.randomUUID(),
    beforeToolCall: async ({ toolCall }) => {
      if (signal?.aborted)
        throw new AppError(
          "REQUEST_CANCELLED",
          "The request was cancelled.",
          499,
        );
      toolCallCount++;
      if (toolCallCount > AGENT_LIMITS.maxToolCalls) {
        limitError = new AppError(
          "MODEL_LIMIT_EXCEEDED",
          "The model used too many tool calls. Try a narrower request.",
          502,
          true,
        );
        agent.abort();
        throw limitError;
      }
      if (!toolNames.has(toolCall.name))
        return { block: true, reason: "This tool is not available." };
      return undefined;
    },
    afterToolCall: async ({ toolCall, isError }) => {
      if (
        completionState &&
        input.completion &&
        toolCall.name === input.completion.name &&
        isError
      )
        recordCompletionFailure(input.completion, completionState, (error) => {
          limitError = error;
          agent.abort();
        });
      return undefined;
    },
    finishTurn: () => {
      if (completionState?.fatal) return { action: "end" };
      if (completionState?.value !== undefined) return { action: "end" };
      if (completionState && turnCount >= AGENT_LIMITS.maxTurns) {
        limitError = new AppError(
          "MODEL_LIMIT_EXCEEDED",
          "The model did not finish within the allowed turns. Try again with a narrower request.",
          502,
          true,
        );
        return { action: "end" };
      }
      return undefined;
    },
    prepareRequest: () => {
      if (signal?.aborted)
        throw new AppError(
          "REQUEST_CANCELLED",
          "The request was cancelled.",
          499,
        );
      if (turnCount > AGENT_LIMITS.maxTurns) {
        limitError = new AppError(
          "MODEL_LIMIT_EXCEEDED",
          "The model did not finish within the allowed turns. Try again with a narrower request.",
          502,
          true,
        );
        throw limitError;
      }
      return undefined;
    },
  });

  const unsubscribe = agent.subscribe(async (event) => {
    if (event.type === "turn_start") {
      turnCount++;
      await options.onEvent?.({ type: "turn_started", turn: turnCount });
      return;
    }
    if (event.type === "message_update") {
      if (
        input.streamText &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        const delta = event.assistantMessageEvent.delta;
        if (!delta) return;
        textChars.value += delta.length;
        if (textChars.value > AGENT_LIMITS.maxTextChars)
          throw new AppError(
            "MODEL_OUTPUT_TOO_LARGE",
            "The model response exceeded the local output limit.",
            502,
          );
        receivedText = true;
        await input.onText?.(delta);
      }
      return;
    }
    const mapped = stableEvent(event, { textChars });
    if (mapped?.type === "text_delta") return;
    if (mapped) await options.onEvent?.(mapped);
  });

  const onAbort = () => agent.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          agent.abort();
        }, options.timeoutMs)
      : undefined;
  if (timeout) timeout.unref();

  try {
    if (signal?.aborted)
      throw new AppError(
        "REQUEST_CANCELLED",
        "The request was cancelled.",
        499,
      );
    let attachments = input.attachments;
    if (
      attachments?.some((attachment) => attachment.data) &&
      !resolved.providerModel.capabilities?.images
    ) {
      if (input.requireImageSupport)
        throw new AppError(
          "MODEL_IMAGES_UNSUPPORTED",
          `${resolved.connection.name} is configured without image input support. Choose an image-capable model in Settings → Providers.`,
          400,
        );
      attachments = attachments.filter((attachment) => !attachment.data);
    }
    await agent.prompt(
      userMessage(input.text, {
        context: input.context,
        attachments,
      }),
    );
    await agent.waitForIdle();
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (timeout) clearTimeout(timeout);
    unsubscribe();
  }

  if (signal?.aborted)
    throw new AppError(
      "REQUEST_CANCELLED",
      "The request was cancelled. Your conversation is saved.",
      499,
    );
  if (timedOut)
    throw new AppError(
      "PROVIDER_TIMEOUT",
      "The model did not respond before the configured operation timeout. Retry the saved request.",
      503,
      true,
    );
  if (limitError) throw limitError;
  if (completionState?.fatal) throw completionState.fatal;

  const messages = agent.state.messages;
  const assistants = assistantMessages(messages);
  const failed = [...assistants]
    .reverse()
    .find(
      (message) =>
        message.stopReason === "error" || message.stopReason === "aborted",
    );
  if (
    failed &&
    !completionState?.value &&
    (failed.stopReason === "error" || !signal?.aborted)
  )
    throw failureFor(failed, resolved.connection.name);
  if (completionState && completionState.value === undefined)
    throw new AppError(
      "MODEL_OUTPUT_INVALID",
      "The model finished without calling the required completion tool. Try again.",
      502,
      true,
    );
  if (input.streamText && !receivedText && !collectText(messages).trim())
    throw new AppError(
      "EMPTY_MODEL_RESPONSE",
      "The provider returned an empty response. Try again.",
      502,
      true,
    );
  return {
    completion: completionState?.value,
    messages,
    turnCount,
    toolCallCount,
    usage: assistants.reduce((total, message) => {
      addUsage(total, message);
      return total;
    }, emptyUsage()),
    text: collectText(messages),
  };
}

export async function runStructured<T>(
  options: StructuredRunOptions<T>,
): Promise<StructuredRunResult<T>> {
  const researchWorkspace = options.allowResearch
    ? await createResearchWorkspace()
    : undefined;
  try {
    const result = await runAgent({
      options,
      text: options.userText,
      context: options.context,
      attachments: options.attachments,
      tools: createTaskTools({
        allowSnapshot: options.allowSnapshot,
        workspace: options.workspace,
        manifest: options.manifest,
        allowResearch: options.allowResearch,
        researchWorkspace,
        allowImages: options.resolved.providerModel.capabilities?.images,
        signal: options.signal,
      }),
      completion: options.completion as CompletionSpec<unknown>,
      streamText: false,
      requireImageSupport: false,
    });
    return {
      value: result.completion as T,
      usage: result.usage,
      turnCount: result.turnCount,
      toolCallCount: result.toolCallCount,
      messages: result.messages,
    };
  } finally {
    if (researchWorkspace)
      await removeResearchWorkspace(researchWorkspace).catch(() => {});
  }
}

export async function runText(
  options: TextRunOptions & {
    onText: (delta: string) => void | Promise<void>;
  },
): Promise<{
  text: string;
  usage: UsageTotals;
  turnCount: number;
  toolCallCount: number;
  messages: AgentMessage[];
}> {
  const result = await runAgent({
    options,
    text: options.userText,
    context: options.context,
    attachments: options.attachments,
    tools: createTaskTools({
      allowSnapshot: false,
    }),
    streamText: true,
    requireImageSupport: true,
    onText: options.onText,
  });
  return {
    text: result.text,
    usage: result.usage,
    turnCount: result.turnCount,
    toolCallCount: result.toolCallCount,
    messages: result.messages,
  };
}
