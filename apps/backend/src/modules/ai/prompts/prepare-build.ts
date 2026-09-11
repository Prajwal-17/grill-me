import type { BuildModelInput } from "../model-gateway";
import { CORE_INSTRUCTIONS, requestPromptContext, type Prompt } from "./core";

export function preparationPrompt(
  input: Omit<BuildModelInput, "clarificationContext">,
): Prompt {
  return {
    instructions:
      CORE_INSTRUCTIONS +
      "\n\nDecide whether one clarification question is essential to create a useful implementation build. Use saved technical context for ordinary gaps. Do not ask for a known fact, or ask merely because the request is broad. Ask only when the missing answer materially changes implementation or assessment. If essential, return one short question and 2–3 distinct, meaningful answer choices. The interface offers a custom answer and a skip action; do not include those choices. Otherwise return question:null and options:[].",
    input: requestPromptContext(input),
  };
}
