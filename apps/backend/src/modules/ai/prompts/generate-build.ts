import type { BuildModelInput } from "../model-gateway";
import { CORE_INSTRUCTIONS, requestPromptContext, type Prompt } from "./core";
import { difficultyPolicy } from "./difficulty-policies";
import { scopePolicy } from "./scope-policies";

const BUILD_REQUIREMENTS = `Return one feasible challenge matching the structured contract.
The subject explicitly requested in currentRequest is mandatory: solving the challenge must exercise that technology or concept. Do not substitute saved interests, recent tasks, or a generic exercise in the same language. "I just learned X" means practice X, with beginner familiarity unless explicitly contradicted. If an unfamiliar tool's essential contract is unknown, ask during preparation rather than invent its API.
Each criterion states one observable behavior in one or two short sentences, at most 320 characters. Use at most 4 criteria for focused, 6 for feature, 8 for system. Do not pack remaining requirements into the last criterion. Cover the bounded task, not every imaginable failure mode. Simplify the task if it cannot be stated clearly within the brief budget. Difficulty comes from reasoning, not verbosity.
problemStatement contains only the task and an example if useful. completionCriteria is the complete acceptance checklist, covering every mandatory behavior and constraint in concise observable terms; expectedOutcome requests code or source files only, never a written explanation or justification. constraints contains only necessary additional constraints, with no duplication. implementationBoundary states the implemented core and exclusions; never request a design essay. Use an empty boundary outside system mode when unnecessary. Return empty implementationMilestones; do not reveal implementation steps.
Choose a concise topic tag. Estimate the actual brief's difficulty from 1 to 10 for this learner, using their experience, familiarity, technical context, and recent evidence. Give a short internal reason. contextualDifficulty is the corresponding easy/medium/hard/grill band. Do not mechanically copy the requested label without assessing the task.
Estimate the implementation time for this learner, not for a generic developer. A time budget bounds implementation breadth, not reasoning difficulty. Do not require learner-authored tests, verification commands, boilerplate, or a production system by default. Starter code is optional and must not leak the solution.
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
