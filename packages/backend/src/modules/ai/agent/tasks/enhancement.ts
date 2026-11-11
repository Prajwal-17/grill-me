import { z } from "zod";
import { enhanceBuildPromptSchema } from "../../../challenges/challenge.schema";
import { enhancedQuizPromptSchema } from "../../../quizzes/quiz.schema";
import { enhancementPrompt } from "../../prompts/enhance-prompt";
import { enhanceQuizPromptPrompt } from "../../prompts/enhance-quiz-prompt";
import { contextBlock } from "../messages";
import type { StructuredTask } from "./types";

export function enhancementTask(input: {
  prompt: string;
  target: "build" | "quiz";
  profileId: string;
}): StructuredTask<{ prompt: string }> {
  const prompt =
    input.target === "build"
      ? enhancementPrompt(input.prompt, "build")
      : enhanceQuizPromptPrompt(input.prompt);
  return {
    operation: "prompt_enhancement",
    instructions: prompt.instructions,
    context: contextBlock("original_request", input.prompt, {
      untrusted: true,
    }),
    userText:
      input.target === "build"
        ? "Rewrite the original request as a clear coding practice request."
        : "Rewrite the original request as a clear quiz request.",
    completion: {
      name: "complete_prompt",
      description: "Return the rewritten request.",
      schema: z.toJSONSchema(enhanceBuildPromptSchema),
      validate: (value) =>
        (input.target === "build"
          ? enhanceBuildPromptSchema
          : enhancedQuizPromptSchema
        ).parse(value),
    },
    allowSnapshot: false,
  };
}
