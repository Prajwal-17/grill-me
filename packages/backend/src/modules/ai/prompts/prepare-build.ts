import type { BuildModelInput } from "../model-gateway";
import { ESSENTIAL_CLARIFICATION_POLICY } from "../../challenges/clarification-policy";
import { SHARED_INSTRUCTIONS, requestPromptContext, type Prompt } from "./core";

export function preparationPrompt(
  input: Omit<BuildModelInput, "clarificationContext">,
): Prompt {
  return {
    instructions:
      SHARED_INSTRUCTIONS +
      "\n\n# Request clarification\n\nYour only action is checking whether essential requirements are missing. Do not generate or assign a challenge in this stage. Any environment preparation follows the saved challenge.\n" +
      ESSENTIAL_CLARIFICATION_POLICY +
      `\n\nDefault to generating without clarification: return question:null and options:[].
Preserve the explicitly named technology as the learning objective; saved preferences never replace it. Generation can inspect public libraries and links later. Ask now only about an essential contract that is private or otherwise unavailable from the supplied material.
Simple requests for practice in a named concept, language, or framework, including lists of recently learned topics, are already sufficient. Generation will choose a useful task and exercise format within the selected scope and difficulty; never ask the user to pick a subtopic, pattern, learning goal, exercise format, or preferred challenge.
Examples that need NO question: "I want an challenge for promises", "Give me a React build", "Help me practice Go", "A TypeScript challenge", or "Build a todo list". Missing optional details do not make these requests ambiguous.
Saved technical context can resolve known requirements. Optional gaps belong to generation's defaults; they are not reasons to ask a preparation question. Do not ask for known facts, the selected scope, difficulty, duration, library preferences, or deployment preferences just to personalize the task.

Exception — experience-shaping choices the request itself raises. When the request signals how large or realistic the prepared codebase should be but leaves it unresolved, such as "a real world application codebase", "production-like", or "an established project" without quantifying it, ask one short question about that shape before generating, because different answers change what preparation builds and how long the exercise takes. Offer 2–3 concrete choices, for example a compact few-file service, a medium module-based codebase, or a larger established codebase with surrounding behavior, data, and history. Ask it only when the request actually raises the decision and the answer is not already settled: a named-topic practice request, an explicit size such as "small" or "one file", or a quantified codebase needs no question.

Beyond that shape decision, ask only if concrete requirements conflict or an essential external contract cannot reasonably be assumed, and different answers would make the requested implementation incompatible. Complexity alone is not a reason to ask.
When truly blocked, return one short, plain question. Use zero options for a free-text answer or 2–3 short, distinct alternatives. Do not include explanations, solution hints, code, or parenthetical examples in choices. The interface offers custom answers. Do not offer Skip or pretend an essential question is optional.`,
    input: requestPromptContext(input),
  };
}
