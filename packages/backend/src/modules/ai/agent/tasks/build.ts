import { z } from "zod";
import type { BuildModelInput } from "../../model-gateway";
import {
  buildGenerationResultSchema,
  challengePreparationSchema,
} from "../../../challenges/challenge.schema";
import { generationPrompt, preparationPrompt } from "../../prompts";
import { normalizePreparationOutput } from "../../preparation-output";
import { normalizeGenerationOutput } from "../../generation-output";
import { contextBlock, attachmentBlock } from "../messages";
import { buildOptions, technicalContext } from "./context";
import type { StructuredTask } from "./types";

/** Attachment text is bounded here so one file cannot flood the prompt. */
const MAX_ATTACHMENT_PROMPT_CHARS = 120_000;

function attachmentBlocks(
  attachments: BuildModelInput["attachments"],
): string | null {
  const texts = (attachments ?? [])
    .filter((attachment) => attachment.text)
    .map((attachment) => ({
      ...attachment,
      text:
        attachment.text.length > MAX_ATTACHMENT_PROMPT_CHARS
          ? attachment.text.slice(0, MAX_ATTACHMENT_PROMPT_CHARS) +
            "\n… truncated"
          : attachment.text,
    }));
  return texts.length ? texts.map(attachmentBlock).join("\n\n") : null;
}

export function preparationTask(
  input: Omit<BuildModelInput, "clarificationContext">,
): StructuredTask<unknown> {
  const prompt = preparationPrompt(input);
  const attachments = attachmentBlocks(input.attachments);
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
      ...(attachments ? [attachments] : []),
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
    allowResearch: true,
  };
}

export function generationTask(
  input: BuildModelInput,
): StructuredTask<unknown> {
  const prompt = generationPrompt(input);
  const history =
    input.clarificationHistory ??
    (input.clarificationContext ? [input.clarificationContext] : []);
  const attachments = attachmentBlocks(input.attachments);
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
      ...(attachments ? [attachments] : []),
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
    allowResearch: true,
  };
}
