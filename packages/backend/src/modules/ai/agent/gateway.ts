import type { ModelSelection } from "@repo/contracts";
import { AppError } from "../../../shared/errors/app-error";
import { startAiLog } from "../../logs/ai-log-recorder";
import type { LogOperation } from "../../logs/log.schema";
import type {
  BuildModelInput,
  JudgeInput,
  ModelGateway,
  QuizModelInput,
  QuizTitleModelInput,
} from "../model-gateway";
import type { Manifest } from "../../projects/snapshot";
import type { MessageAttachment } from "../../messages/message.schema";
import { agentRunStore } from "./store";
import { runStructured, runText, type StructuredRunResult } from "./runtime";
import type { ResolvedAgentModel } from "./providers";
import {
  conversationTask,
  enhancementTask,
  generationTask,
  hintTask,
  preparationTask,
  quizTask,
  quizTitleTask,
  resumeTask,
  reviewTask,
  verificationTask,
  type AgentOperation,
  type CompletionSpec,
  type StructuredTask,
  type TextTask,
} from "./tasks";
import { conversationMessages } from "./messages";
import type { StableAgentEvent } from "./events";
import { TextQueue } from "../../../local/providers/common";

export type AgentRuntime = {
  resolve(selection?: ModelSelection): Promise<ResolvedAgentModel>;
  searchKey(): Promise<string | undefined>;
  timeoutMs?(): number;
};

type Limiter = {
  acquire(signal?: AbortSignal): Promise<() => void>;
};

function limiter(max = 2): Limiter {
  let active = 0;
  const waiters: {
    resolve: (release: () => void) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    abort: () => void;
  }[] = [];
  function release() {
    active--;
    const next = waiters.shift();
    if (!next) return;
    next.signal?.removeEventListener("abort", next.abort);
    active++;
    next.resolve(release);
  }
  return {
    acquire(signal) {
      if (signal?.aborted)
        return Promise.reject(
          new AppError("REQUEST_CANCELLED", "The request was cancelled.", 499),
        );
      if (active < max) {
        active++;
        return Promise.resolve(release);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          signal,
          abort: () => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(
              new AppError(
                "REQUEST_CANCELLED",
                "The request was cancelled.",
                499,
              ),
            );
          },
        };
        signal?.addEventListener("abort", waiter.abort, { once: true });
        waiters.push(waiter);
      });
    },
  };
}

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

export function createPiGateway(runtime: AgentRuntime): ModelGateway {
  const slots = limiter(2);
  const resources = new Map<string, true>();

  function resourceKey(operation: string, id: string) {
    return `${operation}:${id}`;
  }

  async function acquireResource(key: string) {
    if (resources.has(key))
      throw new AppError(
        "AGENT_RESOURCE_BUSY",
        "A response is already running for this conversation. Stop it or wait for it to finish.",
        409,
        true,
      );
    resources.set(key, true);
    return () => resources.delete(key);
  }

  async function executeStructured<T>(
    input: {
      profileId: string;
      operation: AgentOperation;
      challengeId?: string | null;
      resourceKind?: string | null;
      resourceId?: string | null;
      preview: string;
      selection?: ModelSelection;
      signal?: AbortSignal;
      allowTools?: boolean;
    },
    task: StructuredTask<T>,
    options: {
      workspace?: string;
      manifest?: Manifest;
      attachments?: MessageAttachment[];
      timeoutMs?: number;
    } = {},
  ): Promise<StructuredRunResult<T>> {
    const resolved = await runtime.resolve(input.selection);
    const release = await slots.acquire(input.signal);
    const timeoutMs = options.timeoutMs ?? runtime.timeoutMs?.() ?? 900_000;
    const log = await startAiLog(
      {
        profileId: input.profileId,
        challengeId: input.challengeId ?? undefined,
        operation: LOG_OPERATION[input.operation],
        preview: input.preview,
      },
      {
        model: resolved.model.id,
        provider: resolved.connection.name,
        operation: input.operation,
        reasoning: resolved.requestedReasoning,
      },
      resolved.connection.endpoint ?? resolved.connection.preset,
      undefined,
    );
    const runId = await agentRunStore.start({
      profileId: input.profileId,
      operation: input.operation,
      challengeId: input.challengeId ?? null,
      resourceKind: input.resourceKind ?? null,
      resourceId: input.resourceId ?? null,
      providerId: resolved.connection.id,
      providerName: resolved.connection.name,
      providerPreset: resolved.connection.preset,
      model: resolved.model.id,
      reasoningEffort: resolved.requestedReasoning,
    });
    const onEvent = async (event: StableAgentEvent) => {
      if (event.type === "text_delta") return;
      await agentRunStore.event(runId, event.type, event);
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
        allowWebSearch: task.allowWebSearch,
        allowPublicPage: task.allowPublicPage,
        allowSnapshot: task.allowSnapshot,
        workspace: options.workspace,
        manifest: options.manifest,
        signal: input.signal,
        timeoutMs,
        searchKey: await runtime.searchKey(),
        onEvent,
      });
      log.response({
        model: resolved.model.id,
        output_text: JSON.stringify(result.value).slice(0, 16_000),
        usage: logUsage(result.usage),
      });
      await log.finish("success");
      await agentRunStore.finish(runId, {
        status: "completed",
        turnCount: result.turnCount,
        toolCallCount: result.toolCallCount,
        inputTokens: result.usage.input,
        outputTokens: result.usage.output,
        totalTokens: result.usage.totalTokens,
      });
      return result;
    } catch (error) {
      await log.finish(statusFor(error, input.signal), error);
      await agentRunStore.finish(runId, {
        status:
          statusFor(error, input.signal) === "cancelled"
            ? "cancelled"
            : "failed",
        errorCode: error instanceof AppError ? error.code : "AGENT_RUN_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "The agent run failed.",
      });
      throw error;
    } finally {
      release();
    }
  }

  async function* executeText(
    input: {
      profileId: string;
      operation: AgentOperation;
      challengeId?: string | null;
      resourceKind?: string | null;
      resourceId?: string | null;
      preview: string;
      selection?: ModelSelection;
      signal?: AbortSignal;
    },
    task: TextTask,
    history: ReturnType<typeof conversationMessages>,
  ): AsyncGenerator<string> {
    const releaseSlot = await slots.acquire(input.signal);
    let releaseResource = () => {};
    let resolved: ResolvedAgentModel | undefined;
    let runId: string | undefined;
    let log: Awaited<ReturnType<typeof startAiLog>> | undefined;
    const queue = new TextQueue();
    try {
      if (input.resourceKind && input.resourceId)
        releaseResource = await acquireResource(
          resourceKey(input.resourceKind, input.resourceId),
        );
      resolved = await runtime.resolve(input.selection);
      log = await startAiLog(
        {
          profileId: input.profileId,
          challengeId: input.challengeId ?? undefined,
          operation: LOG_OPERATION[input.operation],
          preview: input.preview,
        },
        {
          model: resolved.model.id,
          provider: resolved.connection.name,
          operation: input.operation,
          reasoning: resolved.requestedReasoning,
          stream: true,
        },
        resolved.connection.endpoint ?? resolved.connection.preset,
        undefined,
      );
      runId = await agentRunStore.start({
        profileId: input.profileId,
        operation: input.operation,
        challengeId: input.challengeId ?? null,
        resourceKind: input.resourceKind ?? null,
        resourceId: input.resourceId ?? null,
        providerId: resolved.connection.id,
        providerName: resolved.connection.name,
        providerPreset: resolved.connection.preset,
        model: resolved.model.id,
        reasoningEffort: resolved.requestedReasoning,
      });
      const onEvent = async (event: StableAgentEvent) => {
        if (event.type === "text_delta") return;
        await agentRunStore.event(runId!, event.type, event);
      };
      const running = runText({
        resolved,
        instructions: task.instructions,
        history,
        context: task.context,
        userText: task.userText,
        attachments: task.attachments,
        allowWebSearch: task.allowWebSearch,
        allowPublicPage: task.allowPublicPage,
        signal: input.signal,
        timeoutMs: runtime.timeoutMs?.() ?? 900_000,
        searchKey: await runtime.searchKey(),
        onEvent,
        onText: (delta) => {
          log?.delta(delta);
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
      log.response({
        model: resolved.model.id,
        output_text: result.text.slice(0, 16_000),
        usage: logUsage(result.usage),
      });
      await log.finish("success");
      await agentRunStore.finish(runId, {
        status: "completed",
        turnCount: result.turnCount,
        toolCallCount: result.toolCallCount,
        inputTokens: result.usage.input,
        outputTokens: result.usage.output,
        totalTokens: result.usage.totalTokens,
      });
    } catch (error) {
      if (log) await log.finish(statusFor(error, input.signal), error);
      if (runId)
        await agentRunStore.finish(runId, {
          status:
            statusFor(error, input.signal) === "cancelled"
              ? "cancelled"
              : "failed",
          errorCode:
            error instanceof AppError ? error.code : "AGENT_RUN_FAILED",
          errorMessage:
            error instanceof Error ? error.message : "The agent run failed.",
        });
      throw error;
    } finally {
      releaseResource();
      releaseSlot();
    }
  }

  async function judgeWithSnapshot(
    input: JudgeInput,
    workspace: string,
    manifest: Manifest,
  ) {
    const task = reviewTask(input, true);
    const result = await executeStructured(
      {
        profileId: input.challenge.profileId,
        operation: "review",
        challengeId: input.challenge.id,
        resourceKind: "review",
        resourceId: workspace,
        preview: input.challenge.title,
        selection: input.selection,
        signal: input.signal,
      },
      task,
      {
        workspace,
        manifest,
        attachments: input.attachments.filter(
          (attachment) => attachment.data && attachment.mimeType,
        ),
      },
    );
    return result.value as Awaited<
      ReturnType<NonNullable<ModelGateway["reviewWorkspace"]>>
    >;
  }

  return {
    reviewWorkspace: judgeWithSnapshot,
    async enhanceBuildPrompt(input) {
      return (
        await executeStructured(
          {
            profileId: input.profileId,
            operation: "prompt_enhancement",
            preview: input.prompt,
            selection: input.selection,
          },
          enhancementTask({ ...input, target: "build" }),
        )
      ).value;
    },
    async enhanceQuizPrompt(input) {
      return (
        await executeStructured(
          {
            profileId: input.profileId,
            operation: "prompt_enhancement",
            preview: input.prompt,
            selection: input.selection,
          },
          enhancementTask({ ...input, target: "quiz" }),
        )
      ).value;
    },
    async extractResume(input) {
      return (
        await executeStructured(
          {
            profileId: input.profileId,
            operation: "resume_import",
            preview: "Resume profile draft",
            selection: input.selection,
            signal: input.signal,
          },
          resumeTask(input),
        )
      ).value;
    },
    async generateQuiz(input: QuizModelInput) {
      const profileId =
        input.challenge !== null ? input.challenge.profileId : input.profileId;
      return (
        await executeStructured(
          {
            profileId,
            operation: "quiz_generation",
            challengeId: input.challenge?.id ?? null,
            resourceKind: "quiz",
            resourceId: input.challenge?.id ?? profileId,
            preview: input.challenge
              ? input.challenge.title
              : input.prompt.slice(0, 200),
            selection: input.selection,
            signal: input.signal,
          },
          quizTask(input),
        )
      ).value as Awaited<ReturnType<NonNullable<ModelGateway["generateQuiz"]>>>;
    },
    async generateQuizTitle(input: QuizTitleModelInput) {
      const result = await executeStructured(
        {
          profileId: input.profileId,
          operation: "quiz_title_generation",
          challengeId: input.challengeId,
          preview: input.currentTitle,
          selection: input.selection,
        },
        quizTitleTask(input),
      );
      return result.value.title;
    },
    async judge(input: JudgeInput) {
      const task = reviewTask(input, Boolean(input.workspace));
      const result = await executeStructured(
        {
          profileId: input.challenge.profileId,
          operation: "review",
          challengeId: input.challenge.id,
          resourceKind: "review",
          resourceId: input.workspace ?? input.challenge.id,
          preview: input.challenge.title,
          selection: input.selection,
          signal: input.signal,
        },
        task,
        input.workspace
          ? { workspace: input.workspace, manifest: [] }
          : { attachments: input.attachments },
      );
      return result.value as Awaited<
        ReturnType<NonNullable<ModelGateway["judge"]>>
      >;
    },
    async planVerification(input: JudgeInput) {
      const task = verificationTask(input);
      const result = await executeStructured(
        {
          profileId: input.challenge.profileId,
          operation: "verification",
          challengeId: input.challenge.id,
          preview: "Verification: " + input.challenge.title,
          selection: input.selection,
          signal: input.signal,
        },
        task,
        input.workspace
          ? { workspace: input.workspace, manifest: [] }
          : { attachments: input.attachments },
      );
      return result.value as Awaited<
        ReturnType<NonNullable<ModelGateway["planVerification"]>>
      >;
    },
    async prepareBuild(input) {
      return (
        await executeStructured(
          {
            profileId: input.learner.profileId,
            operation: "preparation",
            preview: input.prompt,
            selection: input.selection,
            signal: input.signal,
          },
          preparationTask(input),
        )
      ).value as Awaited<ReturnType<ModelGateway["prepareBuild"]>>;
    },
    async generateBuild(input: BuildModelInput) {
      return (
        await executeStructured(
          {
            profileId: input.learner.profileId,
            operation: "generation",
            preview: input.prompt,
            selection: input.selection,
            signal: input.signal,
          },
          generationTask(input),
        )
      ).value as Awaited<ReturnType<ModelGateway["generateBuild"]>>;
    },
    respond(input) {
      const task = conversationTask(input);
      return executeText(
        {
          profileId: input.learner.profileId,
          operation: input.mode,
          challengeId: input.challenge.id,
          resourceKind: "conversation",
          resourceId: input.challenge.id,
          preview: input.content || input.challenge.title,
          selection: input.selection,
          signal: input.signal,
        },
        task,
        conversationMessages(input.messages),
      );
    },
    generateHint(input) {
      const task = hintTask(input);
      return executeText(
        {
          profileId: input.learner.profileId,
          operation: "hint",
          challengeId: input.challenge.id,
          resourceKind: "conversation",
          resourceId: input.challenge.id,
          preview: input.challenge.title,
          selection: input.selection,
        },
        task,
        conversationMessages(input.messages),
      );
    },
  };
}
