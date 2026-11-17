import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { ModelSelection } from "@repo/backend/shared/contracts";
import { AppError } from "../../../shared/errors/app-error";
import type { Manifest } from "../../projects/snapshot";
import type { MessageAttachment } from "../../messages/message.schema";
import { TextQueue } from "../../../local/providers/common";
import {
  harnessService,
  type HarnessRecorder,
} from "../../harness/harness.service";
import type { HarnessRunRequest } from "../../harness/types";
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

export type RunTarget = {
  profileId: string;
  operation: AgentOperation;
  challengeId?: string | null;
  resourceKind?: string | null;
  resourceId?: string | null;
  preview: string;
  selection?: ModelSelection;
  signal?: AbortSignal;
  /** Feature-owned thread and turn. Omit to create a durable thread per run. */
  harness?: HarnessRunRequest;
};

type StructuredRunOptions = {
  workspace?: string;
  manifest?: Manifest;
  attachments?: MessageAttachment[];
  timeoutMs?: number;
  /** Extra task-scoped tools, such as project files or an authorized runner. */
  tools?: AgentTool[];
};

function statusFor(
  error: unknown,
  signal?: AbortSignal,
): "failed" | "cancelled" | "interrupted" {
  if (signal?.aborted) return "cancelled";
  if (error instanceof AppError && error.code === "REQUEST_CANCELLED")
    return "cancelled";
  if (error instanceof AppError && error.code === "HARNESS_INTERRUPTED")
    return "interrupted";
  return "failed";
}

function errorFor(error: unknown) {
  return {
    code: error instanceof AppError ? error.code : "AGENT_RUN_FAILED",
    message:
      error instanceof Error
        ? error.message.slice(0, 4_000)
        : "The agent run failed.",
  };
}

export function createAgentExecutor(input: {
  runtime: AgentRuntime;
  slots: ReturnType<typeof createLimiter>;
  resources: ReturnType<typeof createResourceLocks>;
}) {
  const { runtime, slots, resources } = input;

  async function startHarness(
    target: RunTarget,
    resolved: ResolvedAgentModel,
  ): Promise<HarnessRecorder | undefined> {
    if (target.harness) {
      const run = await harnessService.begin({
        threadId: target.harness.threadId,
        turnId: target.harness.turnId,
        inputText: target.harness.inputText,
        model: resolved.model.id,
        connectionId: resolved.connection.id,
        reasoningEffort: resolved.requestedReasoning,
      });
      return run.recorder;
    }
    try {
      const run = await harnessService.beginAutomatic({
        profileId: target.profileId,
        kind: target.operation,
        title: target.preview.slice(0, 500) || target.operation,
        challengeId: target.challengeId ?? null,
        model: resolved.model.id,
        reasoningEffort: resolved.requestedReasoning,
        inputText: target.preview || target.operation,
      });
      return run.recorder;
    } catch (error) {
      // A deleted or synthetic profile must not make an otherwise valid model
      // call fail. Feature-owned threads still surface their errors.
      console.warn("[harness] Could not record this run.", error);
      return undefined;
    }
  }

  async function finishHarness(
    recorder: HarnessRecorder | undefined,
    result:
      | {
          status: "completed";
          usage: { input: number; output: number; totalTokens: number };
        }
      | {
          status: "failed" | "cancelled" | "interrupted";
          error: unknown;
          signal?: AbortSignal;
        },
  ) {
    if (!recorder) return;
    try {
      if (result.status === "completed")
        await recorder.finish({
          status: "completed",
          usage: {
            input: result.usage.input,
            output: result.usage.output,
            totalTokens: result.usage.totalTokens,
          },
        });
      else
        await recorder.finish({
          status: statusFor(result.error, result.signal),
          error: errorFor(result.error),
        });
    } catch (error) {
      console.warn("[harness] Could not finish the run transcript.", error);
    }
  }

  return {
    async structured<T>(
      target: RunTarget,
      task: StructuredTask<T>,
      options: StructuredRunOptions = {},
    ): Promise<StructuredRunResult<T>> {
      const resolved = await runtime.resolve(target.selection);
      const release = await slots.acquire(target.signal);
      let recorder: HarnessRecorder | undefined;
      const onEvent = (event: StableAgentEvent) => {
        if (!recorder) return;
        void recorder.event(event).catch((error) => {
          console.warn("[harness] Could not save a run event.", error);
        });
      };
      try {
        recorder = await startHarness(target, resolved);
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
          tools: options.tools,
          signal: target.signal,
          timeoutMs: options.timeoutMs ?? runtime.timeoutMs?.() ?? 900_000,
          limits: task.limits,
          onEvent,
        });
        await finishHarness(recorder, {
          status: "completed",
          usage: result.usage,
        });
        return result;
      } catch (error) {
        await finishHarness(recorder, {
          status: "failed",
          error,
          signal: target.signal,
        });
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
      let recorder: HarnessRecorder | undefined;
      const queue = new TextQueue();
      try {
        if (target.resourceKind && target.resourceId)
          releaseResource = resources.acquire(
            `${target.resourceKind}:${target.resourceId}`,
          );
        const resolved = await runtime.resolve(target.selection);
        recorder = await startHarness(target, resolved);
        const onEvent = (event: StableAgentEvent) => {
          if (!recorder) return;
          void recorder.event(event).catch((error) => {
            console.warn("[harness] Could not save a run event.", error);
          });
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
        await finishHarness(recorder, {
          status: "completed",
          usage: result.usage,
        });
      } catch (error) {
        await finishHarness(recorder, {
          status: "failed",
          error,
          signal: target.signal,
        });
        throw error;
      } finally {
        releaseResource();
        releaseSlot();
      }
    },
  };
}

export type AgentExecutor = ReturnType<typeof createAgentExecutor>;
