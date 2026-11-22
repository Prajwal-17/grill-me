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

Create one feasible exercise for the engineer's requested subject, scope, difficulty, and time budget. Use relevant experience to calibrate prerequisites. Honor the current request before saved preferences. "I just learned X" means practice X at beginner familiarity unless the request says otherwise. Use recent work to avoid repeating an exercise. Research only enough to confirm essentials. A challenge brief usually needs observable outcomes and constraints, not the exact API or implementation the engineer will investigate.

Choose a small scenario that exercises the skill directly. Specify observable behavior and constraints essential to the exercise. Leave folder layout, module boundaries, API details, storage, extra libraries, and tooling open unless the user requests them or they are necessary to practice the subject. For example, a Hono and Zod exercise can require route validation without assigning a database. Prefer the smallest meaningful set of requirements. Honor explicit exclusions such as no tests.

Honor requested codebase realism. When the request asks for a real-world, production-like, or established codebase, treat that as a requirement about the prepared workspace: the brief must tell preparation to set up an established-feeling codebase with multiple modules, surrounding behavior, existing data or history, and realistic conventions, not a minimal sample shaped only around the exercise. Stay within the selected scope; realism comes from realistic surrounding behavior, not from unbounded size. When the request does not raise it, follow the selected scope as usual.

For debugging exercises, state the observable symptoms, the behavior the engineer must restore, and any reproduction material the brief itself provides. Never name the layers, modules, files, or functions that contain the defects unless the user asked, and do not reveal the causes.

# Brief and result

Use problemStatement for the situation and task. Add Markdown sections or an example only when useful. Keep the complete observable checklist in completionCriteria and avoid restating the checklist in the brief. Each criterion covers one outcome in at most 320 characters. Stay within the scope's schema limit. Use implementationBoundary for meaningful scope restrictions and expectedOutcome for a short description of the workspace deliverable. Do not require learner-authored tests or documentation unless requested or essential to the skill. Leave implementationMilestones empty unless requested.

Honor explicit starting-point and guidance instructions. If the request or a clarification answer explicitly says what should be provided or who sets up the starting project, copy that complete setup instruction verbatim into startingPoint (up to 400 characters), including its qualifiers. Omit startingPoint if no such setup instruction was given. A list of technologies alone does not specify setup. Freedom to choose layout, structure, or tooling, exclusions such as no tests, and run-environment requirements such as running offline, using no API keys, or a fake model are requirements for the brief, never a starting point: keep them in the brief and out of startingPoint. Describe any essential starting conditions in the brief without assuming a generated project or prescribing its files. For debugging, state the symptoms and relevant conditions while keeping the defect, its location, and its fix hidden. Do not generate project files or implement the exercise.

Return status:"ready" with the brief, question:null, and options:[] when feasible. Use status:"needs_clarification", challenge:null, and one concise question only when essential requirements conflict or an essential external contract is unknown. Provide zero options for free text or 2–3 genuine choices. A generic skip does not supply an unknown contract.

Return a concise topic and estimate implementation time for this learner. Report an honest estimatedDifficultyBand with a short reason. Never generate numeric difficulty. If calibrationFeedback is supplied, adjust the reasoning required and relevant cases. Relabeling the previous task alone is invalid. Check the brief for consistency, feasibility, and answer leakage before submitting it.`;

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
