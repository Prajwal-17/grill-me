import {
  reviewResultSchema,
  reviewJsonSchema,
  verificationPlanSchema,
} from "../reviews/review.schema";
import { judgePrompt, verificationPrompt } from "./prompts/judge";
import { z as zod } from "zod";
import OpenAI from "openai";
import type { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import {
  challengePreparationSchema,
  generatedBuildContentSchema,
} from "../challenges/challenge.schema";
import type { ModelGateway } from "./model-gateway";
import { normalizePreparationOutput } from "./preparation-output";
import { modelUnavailable, parseJson } from "./model.utils";
import { startAiLog, type LogContext } from "../logs/ai-log-recorder";
import {
  buildJsonSchema,
  clarificationPrompt,
  generationPrompt,
  hintPrompt,
  preparationJsonSchema,
  preparationPrompt,
  reviewPrompt,
  structuredOutputInstruction,
} from "./prompts";

type StructuredPrompt = {
  instructions: string;
  input: string;
};

function responseText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const response = value as Record<string, unknown>;
  if (typeof response.output_text === "string") return response.output_text;
  if (typeof response.content === "string") return response.content;

  const containers = Array.isArray(response.output)
    ? response.output
    : [response];
  const parts: string[] = [];
  for (const container of containers) {
    if (!container || typeof container !== "object") continue;
    const content = (container as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") parts.push(record.text);
      else if (typeof record.output_text === "string")
        parts.push(record.output_text);
    }
  }
  return parts.join("");
}

function streamEventText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const event = value as Record<string, unknown>;
  if (
    event.type === "response.output_text.delta" &&
    typeof event.delta === "string"
  )
    return event.delta;
  if (
    event.type === "response.output_text.done" &&
    typeof event.text === "string"
  )
    return event.text;
  if (
    event.type === "content_block_delta" &&
    event.delta &&
    typeof event.delta === "object"
  ) {
    const delta = event.delta as Record<string, unknown>;
    return typeof delta.text === "string" ? delta.text : "";
  }
  return "";
}

export async function omnirouteStatus() {
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL ?? "http://localhost:20128/v1";
  if (!apiKey)
    return {
      configured: false,
      online: false,
      message: "Add LLM_API_KEY to apps/backend/.env.",
    };

  try {
    const response = await fetch(baseURL.replace(/\/+$/, "") + "/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2500),
    });
    if (response.status === 401 || response.status === 403)
      return {
        configured: true,
        online: false,
        message: "OmniRoute rejected LLM_API_KEY.",
      };
    if (!response.ok)
      return {
        configured: true,
        online: false,
        message: `OmniRoute returned HTTP ${response.status}.`,
      };
    return {
      configured: true,
      online: true,
      message: "Ready for direct reviews",
    };
  } catch {
    return {
      configured: true,
      online: false,
      message: "OmniRoute is offline or unreachable.",
    };
  }
}

export function createOpenAIModel(
  options: { client?: OpenAI } = {},
): ModelGateway {
  const apiKey = options.client?.apiKey ?? process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL ?? "http://localhost:20128/v1";
  const model = process.env.LLM_MODEL ?? "auto";

  function client() {
    if (options.client) return options.client;
    if (!apiKey) {
      throw new AppError(
        "MODEL_NOT_CONFIGURED",
        "Add LLM_API_KEY to apps/backend/.env before generating a build.",
        503,
        false,
      );
    }

    return new OpenAI({ apiKey, baseURL });
  }

  async function requestStructured<T>(input: {
    context: LogContext;
    prompt: StructuredPrompt;
    name: string;
    stage: "preparation" | "generation" | "review" | "verification";
    signal?: AbortSignal;
    schema: Record<string, unknown>;
    validator: z.ZodType<T>;
    normalize?: (value: unknown) => unknown;
  }): Promise<T> {
    const request = {
      model,
      store: false,
      instructions:
        input.prompt.instructions +
        "\n" +
        structuredOutputInstruction(input.stage, input.schema),
      input: input.prompt.input,
      text: {
        format: {
          type: "json_schema" as const,
          name: input.name,
          strict: true,
          schema: input.schema,
        },
      },
    };
    const log = await startAiLog(
      input.context,
      request,
      options.client?.baseURL ?? baseURL,
      apiKey,
    );
    try {
      const response = await client().responses.create(request, {
        signal: input.signal,
      });
      log.response(response);
      const stage =
        input.stage === "preparation"
          ? "clarification"
          : input.stage === "generation"
            ? "build"
            : input.stage;
      if (response.status === "incomplete") {
        throw new AppError(
          "MODEL_OUTPUT_INCOMPLETE",
          `The model stopped before finishing the ${stage}. Retry or increase the output limit in your provider configuration.`,
          502,
          true,
        );
      }
      if (response.status === "failed") {
        throw new AppError(
          "MODEL_UNAVAILABLE",
          "The model provider failed to complete the request. Try again.",
          502,
          true,
        );
      }
      if (
        response.output?.some(
          (item) =>
            item.type === "message" &&
            item.content.some((part) => part.type === "refusal"),
        )
      ) {
        throw new AppError(
          "MODEL_REFUSAL",
          "The model declined this request. Adjust your request and try again.",
          502,
          true,
        );
      }
      const outputText = responseText(response);
      if (!outputText.trim()) {
        throw new AppError(
          "EMPTY_MODEL_RESPONSE",
          `The provider returned no ${stage} text. Retry or check your combo's Responses API support.`,
          502,
          true,
        );
      }
      let parsed: unknown;
      try {
        parsed = parseJson(outputText);
      } catch {
        throw new AppError(
          "MODEL_OUTPUT_INVALID",
          `The model did not return a single valid JSON ${stage}. Retry or use a combo provider that supports structured output.`,
          502,
          true,
        );
      }
      const validated = input.validator.safeParse(
        input.normalize ? input.normalize(parsed) : parsed,
      );
      if (!validated.success) {
        const fields = [
          ...new Set(
            validated.error.issues.map((issue) =>
              String(issue.path[0] ?? "output"),
            ),
          ),
        ].join(", ");
        throw new AppError(
          "MODEL_OUTPUT_INVALID",
          `The ${stage} response has invalid fields: ${fields}. Try again.`,
          502,
          true,
        );
      }
      await log.finish("success");
      return validated.data;
    } catch (error) {
      await log.finish("error", error);
      return modelUnavailable(error);
    }
  }

  async function* textStream(
    input: StructuredPrompt,
    context: LogContext,
  ): AsyncGenerator<string> {
    const request = {
      model,
      store: false,
      stream: true as const,
      instructions: input.instructions,
      input: input.input,
    };
    const log = await startAiLog(
      context,
      request,
      options.client?.baseURL ?? baseURL,
      apiKey,
    );
    let receivedText = false;
    let completed = false;
    try {
      const events = await client().responses.create(request);
      for await (const event of events) {
        log.event(event);
        const eventRecord = event as unknown as Record<string, unknown>;
        const eventType = eventRecord.type;
        const delta = streamEventText(event);
        if (
          eventType === "response.completed" ||
          eventType === "response.output_text.done" ||
          eventType === "message_stop"
        )
          completed = true;
        if (
          delta &&
          !(eventType === "response.output_text.done" && receivedText)
        ) {
          receivedText = true;
          log.delta(delta);
          yield delta;
        } else if (eventType === "response.completed" && !receivedText) {
          const finalText = responseText(eventRecord.response);
          if (finalText) {
            receivedText = true;
            log.delta(finalText);
            yield finalText;
          }
        } else if (
          eventType === "error" ||
          eventType === "response.failed" ||
          eventType === "response.incomplete"
        ) {
          throw new AppError(
            "MODEL_STREAM_FAILED",
            "The model stream failed before completion. Try again.",
            502,
            true,
          );
        }
      }
      if (!receivedText) {
        throw new AppError(
          "EMPTY_MODEL_RESPONSE",
          "The model returned an empty response. Try again.",
          502,
          true,
        );
      }
      if (!completed)
        throw new AppError(
          "MODEL_STREAM_INCOMPLETE",
          "The model stream ended before confirming completion. Try again.",
          502,
          true,
        );
      await log.finish("success");
    } catch (error) {
      await log.finish("error", error);
      return modelUnavailable(error);
    } finally {
      await log.finish(
        "cancelled",
        new AppError(
          "STREAM_CANCELLED",
          "The response was stopped before completion.",
          499,
        ),
      );
    }
  }

  return {
    judge(input) {
      return requestStructured({
        context: {
          profileId: input.challenge.profileId,
          challengeId: input.challenge.id,
          operation: "review",
          preview: input.challenge.title,
        },
        prompt: judgePrompt(input),
        name: "submission_review",
        stage: "review",
        schema: reviewJsonSchema,
        validator: reviewResultSchema,
        signal: input.signal,
      });
    },
    planVerification(input) {
      return requestStructured({
        context: {
          profileId: input.challenge.profileId,
          challengeId: input.challenge.id,
          operation: "review",
          preview: "Verification: " + input.challenge.title,
        },
        prompt: verificationPrompt(input),
        name: "verification_plan",
        stage: "verification",
        schema: zod.toJSONSchema(verificationPlanSchema),
        validator: verificationPlanSchema,
        signal: input.signal,
      });
    },
    prepareBuild(input) {
      return requestStructured({
        context: {
          profileId: input.learner.profileId,
          operation: "preparation",
          preview: input.prompt,
        },
        prompt: preparationPrompt(input),
        name: "build_preparation",
        stage: "preparation",
        schema: preparationJsonSchema,
        validator: challengePreparationSchema,
        normalize: normalizePreparationOutput,
      });
    },

    generateBuild(input) {
      return requestStructured({
        context: {
          profileId: input.learner.profileId,
          operation: "generation",
          preview: input.prompt,
        },
        prompt: generationPrompt(input),
        name: "engineering_build",
        stage: "generation",
        schema: buildJsonSchema(input.scope),
        validator: generatedBuildContentSchema,
      });
    },

    respond(input) {
      return textStream(
        input.mode === "review"
          ? reviewPrompt(input)
          : clarificationPrompt(input),
        {
          profileId: input.learner.profileId,
          challengeId: input.challenge.id,
          operation: input.mode,
          preview: input.content || input.challenge.title,
        },
      );
    },

    generateHint(input) {
      return textStream(hintPrompt(input), {
        profileId: input.learner.profileId,
        challengeId: input.challenge.id,
        operation: "hint",
        preview: input.challenge.title,
      });
    },
  };
}
