import type { BuildModelInput } from "../model-gateway";
import { CORE_INSTRUCTIONS, requestPromptContext, type Prompt } from "./core";
import { difficultyPolicy } from "./difficulty-policies";
import { scopePolicy } from "./scope-policies";

const BUILD_REQUIREMENTS = `BUILD REQUIREMENTS
Return one complete implementation brief ready for work in an external editor.
Require code, independently observable behavior, verification commands or tests, relevant failure cases, completion criteria, and explicit exclusions.
Use problemStatement for observable inputs, outputs, and failure behavior. Include explicit out-of-scope work in constraints. Include runnable verification commands or specific test cases in completionCriteria.
State necessary interfaces, inputs, outputs, assumptions, and runtime details. Keep all sections mutually consistent.
Provide starter code only when it removes irrelevant setup and does not leak the solution.
Estimate a realistic duration range in minutes for this exact build. Do not treat the estimate as a guarantee.
Difficulty changes engineering pressure, never statement length. Do not add unrelated technologies or filler.
Recent builds discourage repetition; completion is not proof of mastery.
Before returning, check feasibility, technical consistency, selected scope, selected difficulty, and answer leakage. Do not describe that check.`;

export function generationPrompt(input: BuildModelInput): Prompt {
  return {
    instructions: [
      CORE_INSTRUCTIONS,
      scopePolicy(input.scope),
      difficultyPolicy(input.difficulty),
      BUILD_REQUIREMENTS,
    ].join("\n\n"),
    input: requestPromptContext(input),
  };
}
