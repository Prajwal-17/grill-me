import OpenAI from "openai";
import type { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import {
  challengePreparationSchema,
  generatedBuildSchemaForScope,
} from "../challenges/challenge.schema";
import type { ModelGateway } from "./model-gateway";
import { normalizePreparationOutput } from "./preparation-output";
import { modelUnavailable, parseJson } from "./model.utils";
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

export function createOpenAIModel(
  options: { client?: OpenAI } = {},
): ModelGateway {
  const apiKey = process.env.LLM_API_KEY;
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

  async function runRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      return modelUnavailable(error);
    }
  }

  async function requestStructured<T>(input: {
    prompt: StructuredPrompt;
    name: string;
    stage: "preparation" | "generation";
    schema: Record<string, unknown>;
    validator: z.ZodType<T>;
    normalize?: (value: unknown) => unknown;
  }): Promise<T> {
    const response = await runRequest(() =>
      client().responses.create({
        model,
        store: false,
        instructions:
          input.prompt.instructions +
          "\n" +
          structuredOutputInstruction(input.stage, input.schema),
        input: input.prompt.input,
        text: {
          format: {
            type: "json_schema",
            name: input.name,
            strict: true,
            schema: input.schema,
          },
        },
      }),
    );
    const stage = input.stage === "preparation" ? "clarification" : "build";
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
    if (!response.output_text?.trim()) {
      throw new AppError(
        "EMPTY_MODEL_RESPONSE",
        `The provider returned no ${stage} text. Retry or check your combo's Responses API support.`,
        502,
        true,
      );
    }
    let parsed: unknown;
    try {
      parsed = parseJson(response.output_text);
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
    return validated.data;
  }

  async function* textStream(input: StructuredPrompt): AsyncGenerator<string> {
    let events;
    try {
      events = await client().responses.create({
        model,
        store: false,
        stream: true,
        instructions: input.instructions,
        input: input.input,
      });
    } catch (error) {
      return modelUnavailable(error);
    }

    let receivedText = false;
    try {
      for await (const event of events) {
        if (event.type === "response.output_text.delta") {
          receivedText = true;
          yield event.delta;
        } else if (
          event.type === "error" ||
          event.type === "response.failed" ||
          event.type === "response.incomplete"
        ) {
          throw new Error("The model stream failed.");
        }
      }
    } catch (error) {
      return modelUnavailable(error);
    }

    if (!receivedText) {
      throw new AppError(
        "EMPTY_MODEL_RESPONSE",
        "The model returned an empty response. Try again.",
        502,
        true,
      );
    }
  }

  return {
    prepareBuild(input) {
      return requestStructured({
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
        prompt: generationPrompt(input),
        name: "engineering_build",
        stage: "generation",
        schema: buildJsonSchema(input.scope),
        validator: generatedBuildSchemaForScope(input.scope),
      });
    },

    respond(input) {
      return textStream(
        input.mode === "review"
          ? reviewPrompt(input)
          : clarificationPrompt(input),
      );
    },

    generateHint(input) {
      return textStream(hintPrompt(input));
    },
  };
}
