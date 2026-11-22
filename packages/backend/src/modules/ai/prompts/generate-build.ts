import type { BuildModelInput } from "../model-gateway";
import { ESSENTIAL_CLARIFICATION_POLICY } from "../../challenges/clarification-policy";
import {
  SHARED_INSTRUCTIONS,
  RESEARCH_TOOL_POLICY,
  requestPromptContext,
  type Prompt,
} from "./core";
import { difficultyPolicy } from "./difficulty-policies";
import { scopePolicy } from "./scope-policies";

const GENERATION_INSTRUCTIONS = `# Challenge generation

Create a challenge that lets the engineer practice the explicitly requested subject. Use the current request, experience, selected difficulty, and constraints. The current request takes precedence over saved preferences. Experience in one subject does not prove mastery of another. Honor explicit starting-point and guidance requests in the prompt.

Choose an exercise suited to the request: implementation, debugging, investigation, or another supported format. Difficulty controls reasoning required, not boilerplate or verbosity. Keep workload appropriate to the selected scope and time budget.

# Challenge statement

Write a clear, professional problem statement. Use this structure when relevant: Context (situation and necessary background), Task (what the engineer needs to do), Constraints (meaningful restrictions), and Starting point (what is provided and what the engineer is expected to set up). The separate completionCriteria field is the acceptance checklist. Omit sections that do not help; add examples only when they clarify behavior. Keep a short exercise short.

Keep the statement, examples, and criteria consistent. Do not add hidden requirements. Criteria describe concise, observable outcomes. For implementation, state what success means while leaving implementation decisions to the engineer. For debugging, state the system and symptoms without revealing the cause, location, or fix.

Return status:"ready" with one feasible challenge, question:null and options:[] when the task is well defined. If an essential external API contract is unknown or requirements truly conflict, return status:"needs_clarification", challenge:null, and one concise question. Use no options for a free-text contract, or 2–3 genuine alternatives. Never invent an unknown API or bypass an unresolved essential question. A generic skip or "use your judgment" answer does not supply a missing external contract; continue clarification if essential information is still missing. Ordinary named topics already supply enough context; choose sensible task details.
The subject explicitly requested in currentRequest is mandatory: solving the challenge must exercise that technology or concept. Do not substitute saved interests, recent tasks, or a generic exercise in the same language. "I just learned X" means practice X, with beginner familiarity unless explicitly contradicted. If an unfamiliar tool's essential contract is unknown, ask for essential clarification rather than invent its API.
Choose the challenge's structure from the learning goals and requested topics: one integrated problem or several smaller problems within one challenge. This applies across all scopes; scope bounds the total workload, not the topic combinations or problem format. Honor explicit format and coverage requests, match the learner's familiarity, difficulty, and time budget, and avoid assuming advanced prerequisites. Smaller problems are tasks to solve, not implementation steps, and share the challenge's completionCriteria checklist.
Each criterion states one observable behavior in one or two short sentences, at most 320 characters. Use at most the number of criteria allowed by the output schema for the selected scope. Do not pack remaining requirements into the last criterion. Cover the bounded task, not every imaginable failure mode. Simplify the task if it cannot be stated clearly and completely. Difficulty comes from reasoning, not verbosity.
Use problemStatement for the relevant context and task, plus meaningful constraints or starting point when useful. Keep completionCriteria as the authoritative acceptance checklist, covering every mandatory behavior and restriction in concise observable terms without duplicating them in other fields. expectedOutcome requests code or source files only, never a learner-written explanation or justification. Distinguish requested starting materials from work assigned to the engineer. implementationBoundary states the implemented core and exclusions; never request a design essay. Use an empty boundary when the selected scope does not need one. Return empty implementationMilestones unless the user explicitly requests milestones. When requested, provide ordered, observable definitions of done without solving the core exercise.
Choose a concise topic tag. Estimate the actual brief's difficulty as estimatedDifficultyBand: easy, medium, hard, or grill, using experience, topic familiarity, and the projected developer context. Give a short calibration reason. Never generate numeric difficulty. Do not mechanically copy the requested label without assessing the task. If calibrationFeedback is supplied, revise the actual reasoning demand and relevant cases to meet selectedDifficulty. Relabeling the previous task alone is invalid; assess the revised task honestly.
Estimate the implementation time for this learner, not for a generic developer. A time budget bounds implementation breadth, not reasoning difficulty. Do not require learner-authored tests, verification commands, boilerplate, or a production system by default. This stage generates only the saved challenge specification. Never generate source code, package manifests, file contents, file-boundary markers, or a concatenated starter project in any response field. Preparation decides what environment is needed after the specification is saved. Respect requests to start from scratch and leave setup to the engineer in that case. When a starting environment is needed, describe what it should provide without claiming the files already exist or prescribing a fixed set of artifacts. For debugging, describe the symptoms the supplied environment should exhibit without requiring TODOs. Preserve explicit stack, interface, and setup requirements in the brief. Do not implement the learner's core logic.
Use recent work to avoid accidental repetition, not to infer mastery. Check feasibility, consistency, selected scope, difficulty, and answer leakage before returning; do not narrate the check.`;

export function generationPrompt(input: BuildModelInput): Prompt {
  return {
    instructions: [
      SHARED_INSTRUCTIONS,
      RESEARCH_TOOL_POLICY,
      scopePolicy(input.scope),
      difficultyPolicy(input.difficulty),
      ESSENTIAL_CLARIFICATION_POLICY,
      GENERATION_INSTRUCTIONS,
    ].join("\n\n"),
    input: requestPromptContext(input),
  };
}
