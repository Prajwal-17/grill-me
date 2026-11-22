import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import type { ProjectScaffoldModelInput } from "../../model-gateway";

const questionSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
});

export function createAskUserTool(
  ask: NonNullable<ProjectScaffoldModelInput["requestUserInput"]>,
): AgentTool<any> {
  return {
    name: "ask_user",
    label: "Ask the engineer",
    description:
      "Ask one concise question when an essential answer is needed to continue preparation. The engineer may decline.",
    parameters: z.toJSONSchema(questionSchema),
    executionMode: "sequential",
    execute: async (_id, args, signal) => {
      signal?.throwIfAborted();
      const { question } = questionSchema.parse(args);
      const answer = await ask(question, signal);
      signal?.throwIfAborted();
      const result = { answer };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        details: result,
      };
    },
  };
}
