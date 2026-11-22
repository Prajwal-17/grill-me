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
import { contextBlock, systemPrompt, userMessage } from "./messages";
import type { MessageAttachment } from "../../messages/message.schema";
import type { ResolvedAgentModel } from "./providers";

const AGENT_LIMITS = {
  maxTurns: 12,
  maxToolCalls: 24,
  maxTextChars: 32_000,
  completionOnlyTurns: 0,
} as const;

type AgentLimits = {
  maxTurns: number;
  maxToolCalls: number;
  maxTextChars: number;
  completionOnlyTurns: number;
};

function agentLimits(overrides?: Partial<AgentLimits>): AgentLimits {
  return {
    maxTurns: overrides?.maxTurns ?? AGENT_LIMITS.maxTurns,
    maxToolCalls: overrides?.maxToolCalls ?? AGENT_LIMITS.maxToolCalls,
    maxTextChars: overrides?.maxTextChars ?? AGENT_LIMITS.maxTextChars,
    completionOnlyTurns:
      overrides?.completionOnlyTurns ?? AGENT_LIMITS.completionOnlyTurns,
  };
}

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
  limits?: Partial<AgentLimits>;
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
  /**
   * Task-scoped tools in addition to the read-only task tools, such as the
   * project file tools or a later, separately authorized command tool.
   */
  tools?: AgentTool[];
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

const MAX_RESEARCH_RESULTS = 12;
const MAX_RESEARCH_RESULT_CHARS = 2_000;

// Keep evidence rather than old examples of how to call now-unavailable tools.
function finalizationEvidence(messages: AgentMessage[]) {
  const sources = new Map<string, string>();
  const evidence = [];
  let image: MessageAttachment | undefined;
  for (const message of messages) {
    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type !== "toolCall") continue;
        const source =
          block.arguments.url ?? block.arguments.path ?? block.arguments.query;
        if (typeof source === "string")
          sources.set(block.id, source.slice(0, 500));
      }
    } else if (message.role === "toolResult" && !message.isError) {
      const imageBlock = message.content.find(
        (block) => block.type === "image",
      );
      if (imageBlock)
        image = {
          filename: "research-image",
          text: "",
          data: imageBlock.data,
          mimeType: imageBlock.mimeType,
        };
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      if (text)
        evidence.push({
          source: sources.get(message.toolCallId),
          excerpt: text.slice(0, MAX_RESEARCH_RESULT_CHARS),
        });
    }
  }
  return evidence.length || image
    ? userMessage(
        contextBlock(
          "research_evidence",
          evidence.slice(-MAX_RESEARCH_RESULTS),
        ),
        {
          attachments: image ? [image] : [],
        },
      )
    : undefined;
}

function readJsonResult(message: AssistantMessage): unknown {
  const output = collectText([message]).trim();
  const json = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(output)?.[1] ?? output;
  if (!json.startsWith("{")) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

async function runAgent(input: {
  options: BaseRunOptions;
  text: string;
  context?: string;
  attachments?: MessageAttachment[];
  tools: AgentTool[];
  completion?: CompletionSpec<unknown>;
  streamText: boolean;
  onText?: (delta: string) => void | Promise<void>;
}) {
  const { options } = input;
  const { resolved } = options;
  const signal = options.signal;
  const limits = agentLimits(options.limits);
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
  let completionRequested = false;
  let finalizationStart: number | undefined;
  let finalizationEvidenceMessage: AgentMessage | undefined;

  const completionState: CompletionState<unknown> | undefined = input.completion
    ? { failures: 0 }
    : undefined;
  const completionTool = completionState
    ? createCompletionTool(input.completion!, completionState)
    : undefined;
  const tools = completionTool ? [completionTool, ...input.tools] : input.tools;
  const instructions = systemPrompt({
    instructions: options.instructions,
    completionTool: input.completion?.name,
  });

  const agent = new Agent({
    initialState: {
      systemPrompt: instructions,
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
    transformContext: async (messages) => {
      if (finalizationStart === undefined || !completionTool) return messages;
      const before = messages.slice(0, finalizationStart);
      const resultCalls = new Set<string>();
      const after = messages
        .slice(finalizationStart)
        .flatMap((message): AgentMessage[] => {
          if (message.role === "assistant") {
            const calls = message.content.filter(
              (block) =>
                block.type === "toolCall" && block.name === completionTool.name,
            );
            for (const call of calls)
              if (call.type === "toolCall") resultCalls.add(call.id);
            if (!calls.length) return [];
            return [
              {
                ...message,
                content: message.content.filter(
                  (block) =>
                    block.type !== "toolCall" || resultCalls.has(block.id),
                ),
              },
            ];
          }
          if (message.role === "toolResult")
            return resultCalls.has(message.toolCallId) ? [message] : [];
          return message.role === "system" || message.role === "user"
            ? [message]
            : [];
        });
      return [
        ...before.filter(
          (message) => message.role === "system" || message.role === "user",
        ),
        ...(finalizationEvidenceMessage ? [finalizationEvidenceMessage] : []),
        ...after,
      ];
    },
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
      if (toolCallCount > limits.maxToolCalls) {
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
    finishTurn: async ({ message }) => {
      if (completionState?.fatal) return { action: "end" };
      if (completionState?.value !== undefined) return { action: "end" };
      if (message.stopReason === "error" || message.stopReason === "aborted")
        return undefined;
      // Some providers return the object directly even with a completion tool.
      // Accept it only through the same validator used for tool calls.
      if (
        completionTool &&
        limits.completionOnlyTurns &&
        message.stopReason === "stop"
      ) {
        const value = readJsonResult(message);
        if (value !== undefined) {
          try {
            await completionTool.execute("structured-json", value);
            return { action: "end" };
          } catch {
            recordCompletionFailure(
              input.completion!,
              completionState!,
              (error) => {
                limitError = error;
              },
            );
            if (completionState?.fatal) return { action: "end" };
          }
        }
      }
      if (completionState && turnCount >= limits.maxTurns) {
        limitError = new AppError(
          "MODEL_LIMIT_EXCEEDED",
          "The model did not finish within the allowed turns. Try again with a narrower request.",
          502,
          true,
        );
        return { action: "end" };
      }
      // A prose answer still needs to be submitted through the result contract.
      if (
        completionTool &&
        limits.completionOnlyTurns &&
        message.stopReason === "stop"
      ) {
        completionRequested = true;
        return { action: "continue" };
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
      if (turnCount > limits.maxTurns) {
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
    prepareNextTurnWithContext: ({ context }) => {
      if (
        !completionTool ||
        !limits.completionOnlyTurns ||
        finalizationStart !== undefined ||
        (!completionRequested &&
          turnCount < limits.maxTurns - limits.completionOnlyTurns)
      )
        return undefined;
      finalizationStart = context.messages.length;
      finalizationEvidenceMessage = finalizationEvidence(context.messages);
      return {
        context: { ...context, tools: [completionTool] },
        messages: [
          {
            role: "system",
            content: `Research is finished. Do not fetch, search, or read more files. Submit the result now using ${completionTool.name} and the evidence already gathered. Follow the task's result contract, including its clarification option when essential information is missing. If you cannot call the tool, return the same result object as JSON alone.`,
            timestamp: Date.now(),
          },
        ],
      };
    },
  });

  await options.onEvent?.({
    type: "prompt_captured",
    at: Date.now(),
    systemPrompt: instructions,
    userText: input.text,
    ...(input.context ? { context: input.context } : {}),
    tools: tools.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
    })),
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
        if (textChars.value > limits.maxTextChars)
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
    const attachments = input.attachments;
    if (
      attachments?.some((attachment) => attachment.data) &&
      !resolved.providerModel.capabilities?.images
    )
      throw new AppError(
        "MODEL_IMAGES_UNSUPPORTED",
        `${resolved.connection.name} is configured without image input support, so it cannot read the attached images. Choose an image-capable model in Settings → Providers.`,
        400,
      );
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
      tools: [
        ...(options.tools ?? []),
        ...createTaskTools({
          allowSnapshot: options.allowSnapshot,
          workspace: options.workspace,
          manifest: options.manifest,
          allowResearch: options.allowResearch,
          researchWorkspace,
          allowImages: options.resolved.providerModel.capabilities?.images,
          signal: options.signal,
        }),
      ],
      completion: options.completion as CompletionSpec<unknown>,
      streamText: false,
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
