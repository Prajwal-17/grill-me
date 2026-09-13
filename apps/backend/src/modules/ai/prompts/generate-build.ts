import type { BuildModelInput } from "../model-gateway";
import { CORE_INSTRUCTIONS, requestPromptContext, type Prompt } from "./core";
import { difficultyPolicy } from "./difficulty-policies";
import { scopePolicy } from "./scope-policies";

const BUILD_REQUIREMENTS = `Return one feasible challenge matching the structured contract.
problemStatement contains only the task and an example if useful. completionCriteria is the complete acceptance checklist, covering every mandatory behavior and constraint in concise observable terms; expectedOutcome says exactly what to submit. constraints contains only necessary additional constraints, with no duplication. implementationBoundary separates implemented core from design explanation. Use an empty boundary outside system mode when unnecessary. Return empty implementationMilestones; do not reveal implementation steps.
Choose a concise topic tag. Estimate the actual brief's difficulty from 1 to 10 relative to the learner's familiarity and prerequisites, with a short reason. contextualDifficulty is the corresponding easy/medium/hard/grill band. Do not mechanically copy the requested label without assessing the task.
Estimate duration honestly. A time budget bounds implementation breadth, not reasoning difficulty. Do not require learner-authored tests, verification commands, boilerplate, or a production system by default. Starter code is optional and must not leak the solution.
Use recent work to avoid accidental repetition, not to infer mastery. Check feasibility, consistency, selected scope, difficulty, and answer leakage before returning; do not narrate the check.`;

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
