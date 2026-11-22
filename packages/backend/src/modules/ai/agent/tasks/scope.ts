import { z } from "zod";
import {
  scopeResolutionResultSchema,
  type BuildScope,
} from "../../../challenges/challenge.schema";
import { scopeResolutionPrompt } from "../../prompts/resolve-scope";
import { contextBlock } from "../messages";
import { technicalContext } from "./context";
import type { StructuredTask } from "./types";
import type { ScopeResolutionInput } from "../../model-gateway";

export function scopeResolutionTask(
  input: ScopeResolutionInput,
): StructuredTask<{ scope: BuildScope }> {
  const prompt = scopeResolutionPrompt();
  return {
    operation: "scope_resolution",
    instructions: prompt.instructions,
    context: contextBlock(
      "developer_context",
      technicalContext(input.learner, input.prompt),
      { untrusted: false },
    ),
    userText: input.prompt,
    completion: {
      name: "complete_scope",
      description: "Return the scope that fits the request.",
      schema: z.toJSONSchema(scopeResolutionResultSchema),
      validate: (value) => {
        const parsed = scopeResolutionResultSchema.safeParse(value);
        if (!parsed.success)
          throw new Error("Return scope as one of: focused, feature, system.");
        return parsed.data;
      },
    },
    allowSnapshot: false,
    allowResearch: false,
    limits: { maxTurns: 3, completionOnlyTurns: 2 },
  };
}
