import type { BuildModelInput } from "../model-gateway";
import { ESSENTIAL_CLARIFICATION_POLICY } from "../../challenges/clarification-policy";
import {
  RESEARCH_TOOL_POLICY,
  SHARED_INSTRUCTIONS,
  requestPromptContext,
  type Prompt,
} from "./core";

export function preparationPrompt(
  input: Omit<BuildModelInput, "clarificationContext">,
): Prompt {
  return {
    instructions:
      SHARED_INSTRUCTIONS +
      "\n\n# Request clarification\n\nYour only action is checking whether essential requirements are missing. Do not generate or assign a challenge in this stage. Any environment preparation follows the saved challenge.\n" +
      RESEARCH_TOOL_POLICY +
      "\n" +
      ESSENTIAL_CLARIFICATION_POLICY +
      `\n\nDefault to generating without clarification: return question:null and options:[].
Preserve the explicitly named technology as the learning objective; saved preferences never replace it. If an unfamiliar external tool requires an unknown essential API contract, ask for that contract rather than substituting an unrelated exercise.
Simple requests for practice in a named concept, language, or framework, including lists of recently learned topics, are already sufficient. Generation will choose a useful task and exercise format within the selected scope and difficulty; never ask the user to pick a subtopic, pattern, learning goal, exercise format, or preferred challenge.
Examples that need NO question: "I want an challenge for promises", "Give me a React build", "Help me practice Go", "A TypeScript challenge", or "Build a todo list". Missing optional details do not make these requests ambiguous.
Saved technical context can resolve known requirements. Optional gaps belong to generation's defaults; they are not reasons to ask a preparation question. Do not ask for known facts, scope, difficulty, duration, library preferences, or deployment preferences just to personalize the task.
Ask only if concrete requirements conflict or an essential external contract cannot reasonably be assumed, and different answers would make the requested implementation incompatible. Complexity alone is not a reason to ask.
When truly blocked, return one short, plain question. Use zero options for a free-text answer or 2–3 short, distinct alternatives. Do not include explanations, solution hints, code, or parenthetical examples in choices. The interface offers custom answers. Do not offer Skip or pretend an essential question is optional.`,
    input: requestPromptContext(input),
  };
}
