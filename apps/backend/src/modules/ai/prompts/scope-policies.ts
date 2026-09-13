import type { BuildScope } from "../../challenges/challenge.schema";
const policies: Record<BuildScope, string> = {
  focused:
    "FOCUSED: One behavior or tightly related concept. A function or small implementation. No milestones. Target 60–120 words for easy, at most 200 for other difficulties across the complete brief.",
  feature:
    "FEATURE: Several cooperating units implementing one bounded feature. Target 120–220 words for the complete brief. Do not expand into a complete product. No solution-revealing milestones.",
  system:
    "SYSTEM: A realistic whole-system scenario with a clearly bounded working core and relevant design questions. State what to implement and what only needs explanation. No deployment or full-product requirement by default. Target 180–300 words for the complete brief. No mandatory milestones.",
};
export const scopePolicy = (scope: BuildScope) => policies[scope];
