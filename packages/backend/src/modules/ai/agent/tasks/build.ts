import { z } from "zod";
import type { BuildModelInput } from "../../model-gateway";
import {
  buildGenerationResultSchema,
  challengePreparationSchema,
} from "../../../challenges/challenge.schema";
import { generationPrompt, preparationPrompt } from "../../prompts";
import { normalizePreparationOutput } from "../../preparation-output";
import { normalizeGenerationOutput } from "../../generation-output";
import { contextBlock } from "../messages";
import { buildOptions, technicalContext } from "./context";
import type { StructuredTask } from "./types";

export function preparationTask(
  input: Omit<BuildModelInput, "clarificationContext">,
): StructuredTask<unknown> {
  const prompt = preparationPrompt(input);
  return {
    operation: "preparation",
    instructions: prompt.instructions,
    context: [
      contextBlock("build_options", buildOptions(input), { untrusted: false }),
      contextBlock(
        "developer_context",
        technicalContext(input.learner, input.prompt),
        { untrusted: false },
      ),
    ].join("\n\n"),
    userText: input.prompt,
    completion: {
      name: "complete_preparation",
      description:
        "Return the essential clarification check result. Use question:null and options:[] when no clarification is needed.",
      schema: z.toJSONSchema(challengePreparationSchema),
      validate: (value) =>
        challengePreparationSchema.parse(normalizePreparationOutput(value)),
    },
    allowSnapshot: false,
  };
}

export function generationTask(
  input: BuildModelInput,
): StructuredTask<unknown> {
  const prompt = generationPrompt(input);
  const history =
    input.clarificationHistory ??
    (input.clarificationContext ? [input.clarificationContext] : []);
  return {
    operation: "generation",
    instructions: prompt.instructions,
    context: [
      contextBlock("build_options", buildOptions(input), { untrusted: false }),
      contextBlock(
        "developer_context",
        technicalContext(input.learner, input.prompt),
        { untrusted: false },
      ),
      contextBlock("clarification_history", history, { untrusted: false }),
      ...(input.calibrationFeedback
        ? [
            contextBlock("calibration_feedback", input.calibrationFeedback, {
              untrusted: true,
            }),
          ]
        : []),
    ].join("\n\n"),
    userText: input.prompt,
    completion: {
      name: "complete_challenge",
      description:
        "Return the finished challenge or a clarification result. Use exactly one complete, validated object.",
      schema: z.toJSONSchema(buildGenerationResultSchema(input.scope)),
      validate: (value) =>
        buildGenerationResultSchema(input.scope).parse(
          normalizeGenerationOutput(value),
        ),
    },
    allowSnapshot: false,
  };
}
