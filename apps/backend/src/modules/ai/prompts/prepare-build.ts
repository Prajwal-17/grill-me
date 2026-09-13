import type { BuildModelInput } from "../model-gateway";
import { CORE_INSTRUCTIONS, requestPromptContext, type Prompt } from "./core";

export function preparationPrompt(
  input: Omit<BuildModelInput, "clarificationContext">,
): Prompt {
  return {
    instructions:
      CORE_INSTRUCTIONS +
      `\n\nDefault to generating without clarification: return question:null and options:[].
Preserve the explicitly named technology as the learning objective; saved preferences never replace it. If an unfamiliar external tool requires an unknown essential API contract, ask for that contract rather than substituting an unrelated exercise.
Simple requests for practice in a named concept, language, or framework are already sufficient. Choose a useful concrete task within the selected scope and difficulty; never ask the user to pick a subtopic, pattern, learning goal, or preferred challenge.
Examples that need NO question: "I want an challenge for promises", "Give me a React build", "Help me practice Go", "A TypeScript challenge", or "Build a todo list". Missing optional details do not make these requests ambiguous.
Use saved technical context for ordinary gaps; otherwise choose sensible defaults and state assumptions in the build. Do not ask for known facts, scope, difficulty, duration, library preferences, or deployment preferences just to personalize the task.
Ask only if concrete requirements conflict or an essential external contract cannot reasonably be assumed, and different answers would make the requested implementation incompatible. Complexity alone is not a reason to ask.
When truly blocked, return one short, plain question and 2–3 short, distinct answers. Do not include explanations, solution hints, code, or parenthetical examples in choices. The interface already offers a custom answer and Skip; do not include those choices.`,
    input: requestPromptContext(input),
  };
}
