import type { BuildModelInput } from "../model-gateway";
import { ESSENTIAL_CLARIFICATION_POLICY } from "../../challenges/clarification-policy";
import { CORE_INSTRUCTIONS, requestPromptContext, type Prompt } from "./core";
import { difficultyPolicy } from "./difficulty-policies";
import { scopePolicy } from "./scope-policies";

const BUILD_REQUIREMENTS = `Return status:"ready" with one feasible challenge, question:null and options:[] when the task is well defined. If an essential external API contract is unknown or requirements truly conflict, return status:"needs_clarification", challenge:null, and one concise question. Use no options for a free-text contract, or 2–3 genuine alternatives. Never invent an unknown API or bypass an unresolved essential question. A generic skip or "use your judgment" answer does not supply a missing external contract; continue clarification if essential information is still missing. Ordinary named topics already supply enough context; choose sensible task details.
The subject explicitly requested in currentRequest is mandatory: solving the challenge must exercise that technology or concept. Do not substitute saved interests, recent tasks, or a generic exercise in the same language. "I just learned X" means practice X, with beginner familiarity unless explicitly contradicted. If an unfamiliar tool's essential contract is unknown, ask for essential clarification rather than invent its API.
Each criterion states one observable behavior in one or two short sentences, at most 320 characters. Use at most 4 criteria for focused, 6 for feature, 8 for system. Do not pack remaining requirements into the last criterion. Cover the bounded task, not every imaginable failure mode. Simplify the task if it cannot be stated clearly within the brief budget. Difficulty comes from reasoning, not verbosity.
problemStatement contains only the task and an example if useful. completionCriteria is the complete acceptance checklist, covering every mandatory behavior and constraint in concise observable terms; expectedOutcome requests code or source files only, never a written explanation or justification. constraints must be empty. Put all mandatory restrictions in the authoritative completionCriteria checklist, without duplication. implementationBoundary states the implemented core and exclusions; never request a design essay. Use an empty boundary outside system mode when unnecessary. Return empty implementationMilestones; do not reveal implementation steps.
Choose a concise topic tag. Estimate the actual brief's difficulty as estimatedDifficultyBand: easy, medium, hard, or grill, using experience, topic familiarity, and the projected developer context. Give a short calibration reason. Never generate numeric difficulty. Do not mechanically copy the requested label without assessing the task. If calibrationFeedback is supplied, revise the actual reasoning demand and relevant cases to meet selectedDifficulty. Relabeling the previous task alone is invalid; assess the revised task honestly.
Estimate the implementation time for this learner, not for a generic developer. A time budget bounds implementation breadth, not reasoning difficulty. Do not require learner-authored tests, verification commands, boilerplate, or a production system by default. Starter code is optional and must not leak the solution.
Use recent work to avoid accidental repetition, not to infer mastery. Check feasibility, consistency, selected scope, difficulty, and answer leakage before returning; do not narrate the check.`;

export function generationPrompt(input: BuildModelInput): Prompt {
  return {
    instructions: [
      CORE_INSTRUCTIONS,
      scopePolicy(input.scope),
      difficultyPolicy(input.difficulty),
      ESSENTIAL_CLARIFICATION_POLICY,
      BUILD_REQUIREMENTS,
    ].join("\n\n"),
    input: requestPromptContext(input),
  };
}
