import { SHARED_INSTRUCTIONS } from "./core";

const FOCUSED =
  "FOCUSED: one small exercise centered on a single skill or behavior.";
const FEATURE =
  "FEATURE: one bounded feature whose exercise needs a few cooperating parts.";
const SYSTEM =
  "SYSTEM: a realistic scenario with a bounded working core that spans several components or services.";

export function scopeResolutionPrompt(): {
  instructions: string;
  input: string;
} {
  return {
    instructions:
      SHARED_INSTRUCTIONS +
      `\n\n# Choose the practice scope

Decide which scope fits the engineer's request best and return it as scope. Judge by the cooperating work the exercise needs, not by how ambitious the topic sounds. ${FOCUSED} ${FEATURE} ${SYSTEM}

Default to focused when a small exercise would serve the request. Choose feature when practicing well needs several cooperating parts, such as an endpoint with validation plus persistence. Choose system only when the request explicitly asks for multiple services, workflows, or architecture spanning components, or when the exercise investigates behavior across such a system. A narrow task about one part of a large subject stays focused. Do not ask questions and do not explain the choice.`,
    input: "Return the scope that fits this request.",
  };
}
