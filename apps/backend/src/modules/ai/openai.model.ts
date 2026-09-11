import OpenAI from "openai";
import type { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import {
  challengeContentSchema,
  type ChallengeFormat,
  challengePreparationSchema,
} from "../challenges/challenge.schema";
import type { ModelGateway } from "./model-gateway";
import { modelUnavailable, parseJson } from "./model.utils";
import {
  clarificationPrompt,
  generationPrompt,
  hintPrompt,
  preparationPrompt,
  reviewPrompt,
} from "./prompt-helpers";

const challengeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "type",
    "problemStatement",
    "expectedOutcome",
    "constraints",
    "starterCode",
    "completionCriteria",
  ],
  properties: {
    title: { type: "string", minLength: 3, maxLength: 120 },
    type: {
      type: "string",
      enum: ["exercise", "question", "architecture", "mini-project"],
    },
    problemStatement: { type: "string", minLength: 20 },
    expectedOutcome: { type: "string", minLength: 10 },
    constraints: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 1 },
    },
    starterCode: { type: ["string", "null"] },
    completionCriteria: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 1 },
    },
  },
} as const;

const preparationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "options"],
  properties: {
    question: { type: ["string", "null"] },
    options: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 3,
    },
  },
} as const;

type StructuredPrompt = {
  instructions: string;
  input: string;
};

function challengeValidator(format: ChallengeFormat) {
  return challengeContentSchema.superRefine((challenge, context) => {
    if (format !== "auto" && challenge.type !== format) {
      context.addIssue({
        code: "custom",
        message: `Challenge type must be ${format}.`,
        path: ["type"],
      });
    }
  });
}

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
        "Add LLM_API_KEY to apps/backend/.env before generating a challenge.",
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
    schema: Record<string, unknown>;
    validator: z.ZodType<T>;
  }): Promise<T> {
    const response = await runRequest(() =>
      client().responses.create({
        model,
        store: false,
        instructions: input.prompt.instructions,
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
    try {
      return input.validator.parse(parseJson(response.output_text));
    } catch {
      throw new AppError(
        "MODEL_OUTPUT_INVALID",
        "The model returned an invalid response. Try again.",
        502,
        true,
      );
    }
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
    prepareChallenge(input) {
      return requestStructured({
        prompt: preparationPrompt(input),
        name: "challenge_preparation",
        schema: preparationJsonSchema,
        validator: challengePreparationSchema,
      });
    },

    generateChallenge(input) {
      return requestStructured({
        prompt: generationPrompt(input),
        name: "engineering_challenge",
        schema: challengeJsonSchema,
        validator: challengeValidator(input.format),
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
