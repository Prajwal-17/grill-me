import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ModelSelection } from "@repo/backend/shared/contracts";
import { AppError } from "../../../shared/errors/app-error";
import { startAiLog } from "../../logs/ai-log-recorder";
import type { LogOperation } from "../../logs/log.schema";
import type { Manifest } from "../../projects/snapshot";
import type { MessageAttachment } from "../../messages/message.schema";
import { TextQueue } from "../../../local/providers/common";
import { agentRunStore } from "./store";
import { runStructured, runText, type StructuredRunResult } from "./runtime";
import type { ResolvedAgentModel } from "./providers";
import type {
  AgentOperation,
  CompletionSpec,
  StructuredTask,
  TextTask,
} from "./tasks";
import type { StableAgentEvent } from "./events";
import type { AgentRuntime } from "./types";
import type { createLimiter, createResourceLocks } from "./limiter";

const LOG_OPERATION: Record<AgentOperation, LogOperation> = {
  preparation: "preparation",
  generation: "generation",
  clarify: "clarify",
  review: "review",
  hint: "hint",
  quiz_generation: "quiz_generation",
  quiz_title_generation: "quiz_title_generation",
  prompt_enhancement: "prompt_enhancement",
  resume_import: "resume_import",
  verification: "review",
};

export type RunTarget = {
  profileId: string;
  operation: AgentOperation;
  challengeId?: string | null;
  resourceKind?: string | null;
  resourceId?: string | null;
  preview: string;
  selection?: ModelSelection;
  signal?: AbortSignal;
};

type StructuredRunOptions = {
  workspace?: string;
  manifest?: Manifest;
  attachments?: MessageAttachment[];
  timeoutMs?: number;
};

type RunContext = {
  resolved: ResolvedAgentModel;
  runId: string;
  log: Awaited<ReturnType<typeof startAiLog>>;
};

function logUsage(usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}) {
  return {
    input_tokens: usage.input,
    output_tokens: usage.output,
    total_tokens: usage.totalTokens,
    input_tokens_details: { cached_tokens: usage.cacheRead },
    output_tokens_details: { reasoning_tokens: 0 },
  };
}

function statusFor(
  error: unknown,
  signal?: AbortSignal,
): "success" | "error" | "cancelled" {
  if (signal?.aborted) return "cancelled";
  if (error instanceof AppError && error.code === "REQUEST_CANCELLED")
    return "cancelled";
  return "error";
}

export function createAgentExecutor(input: {
  runtime: AgentRuntime;
  slots: ReturnType<typeof createLimiter>;
  resources: ReturnType<typeof createResourceLocks>;
}) {
  const { runtime, slots, resources } = input;

  async function startRun(
    target: RunTarget,
    resolved: ResolvedAgentModel,
    stream: boolean,
  ): Promise<RunContext> {
    const log = await startAiLog(
      {
        profileId: target.profileId,
        challengeId: target.challengeId ?? undefined,
        operation: LOG_OPERATION[target.operation],
        preview: target.preview,
      },
      {
        model: resolved.model.id,
        provider: resolved.connection.name,
        operation: target.operation,
        reasoning: resolved.requestedReasoning,
        ...(stream ? { stream: true } : {}),
      },
      resolved.connection.endpoint ?? resolved.connection.preset,
    );
    const runId = await agentRunStore.start({
      profileId: target.profileId,
      operation: target.operation,
      challengeId: target.challengeId ?? null,
      resourceKind: target.resourceKind ?? null,
      resourceId: target.resourceId ?? null,
      providerId: resolved.connection.id,
      providerName: resolved.connection.name,
      providerPreset: resolved.connection.preset,
      model: resolved.model.id,
      reasoningEffort: resolved.requestedReasoning,
    });
    return { resolved, runId, log };
  }

  async function finishSuccess(
    context: RunContext,
    usage: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      totalTokens: number;
    },
    outputText: string,
    turnCount: number,
    toolCallCount: number,
  ) {
    context.log.response({
      model: context.resolved.model.id,
      output_text: outputText.slice(0, 16_000),
      usage: logUsage(usage),
    });
    await context.log.finish("success");
    await agentRunStore.finish(context.runId, {
      status: "completed",
      turnCount,
      toolCallCount,
      inputTokens: usage.input,
      outputTokens: usage.output,
      totalTokens: usage.totalTokens,
    });
  }

  async function finishFailure(
    context: RunContext,
    error: unknown,
    signal?: AbortSignal,
  ) {
    const status = statusFor(error, signal);
    await context.log.finish(status, error);
    await agentRunStore.finish(context.runId, {
      status: status === "cancelled" ? "cancelled" : "failed",
      errorCode: error instanceof AppError ? error.code : "AGENT_RUN_FAILED",
      errorMessage:
        error instanceof Error ? error.message : "The agent run failed.",
    });
  }

  return {
    async structured<T>(
      target: RunTarget,
      task: StructuredTask<T>,
      options: StructuredRunOptions = {},
    ): Promise<StructuredRunResult<T>> {
      const resolved = await runtime.resolve(target.selection);
      const release = await slots.acquire(target.signal);
      const context = await startRun(target, resolved, false);
      const onEvent = async (event: StableAgentEvent) => {
        if (event.type === "text_delta") return;
        await agentRunStore.event(context.runId, event.type, event);
      };
      try {
        if (resolved.providerModel.capabilities?.tools === false)
          throw new AppError(
            "MODEL_TOOLS_UNSUPPORTED",
            `${resolved.connection.name} is configured without tool support, so it cannot produce this structured result. Choose a tool-capable model in Settings → Providers.`,
            503,
          );
        const result = await runStructured<T>({
          resolved,
          instructions: task.instructions,
          context: task.context,
          userText: task.userText,
          attachments: options.attachments,
          completion: task.completion as CompletionSpec<T>,
          allowSnapshot: task.allowSnapshot,
          allowResearch: task.allowResearch,
          workspace: options.workspace,
          manifest: options.manifest,
          signal: target.signal,
          timeoutMs: options.timeoutMs ?? runtime.timeoutMs?.() ?? 900_000,
          onEvent,
        });
        await finishSuccess(
          context,
          result.usage,
          JSON.stringify(result.value),
          result.turnCount,
          result.toolCallCount,
        );
        return result;
      } catch (error) {
        await finishFailure(context, error, target.signal);
        throw error;
      } finally {
        release();
      }
    },

    async *text(
      target: RunTarget,
      task: TextTask,
      history: AgentMessage[],
    ): AsyncGenerator<string> {
      const releaseSlot = await slots.acquire(target.signal);
      let releaseResource = () => {};
      let context: RunContext | undefined;
      const queue = new TextQueue();
      try {
        if (target.resourceKind && target.resourceId)
          releaseResource = resources.acquire(
            `${target.resourceKind}:${target.resourceId}`,
          );
        const resolved = await runtime.resolve(target.selection);
        context = await startRun(target, resolved, true);
        const onEvent = async (event: StableAgentEvent) => {
          if (event.type === "text_delta") return;
          await agentRunStore.event(context!.runId, event.type, event);
        };
        const running = runText({
          resolved,
          instructions: task.instructions,
          history,
          context: task.context,
          userText: task.userText,
          attachments: task.attachments,
          signal: target.signal,
          timeoutMs: runtime.timeoutMs?.() ?? 900_000,
          onEvent,
          onText: (delta) => {
            context?.log.delta(delta);
            queue.push(delta);
          },
        });
        const settled = running.then(
          (result) => {
            queue.end();
            return result;
          },
          (error) => {
            queue.fail(error);
            throw error;
          },
        );
        try {
          for await (const delta of queue) yield delta;
        } finally {
          await settled.catch(() => {});
        }
        const result = await settled;
        await finishSuccess(
          context,
          result.usage,
          result.text,
          result.turnCount,
          result.toolCallCount,
        );
      } catch (error) {
        if (context) await finishFailure(context, error, target.signal);
        throw error;
      } finally {
        releaseResource();
        releaseSlot();
      }
    },
  };
}

export type AgentExecutor = ReturnType<typeof createAgentExecutor>;
