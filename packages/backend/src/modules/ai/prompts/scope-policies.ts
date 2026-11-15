import type { BuildScope } from "../../challenges/challenge.schema";
const policies: Record<BuildScope, string> = {
  focused:
    "FOCUSED: Keep the total implementation small and narrowly bounded. Include milestones only when explicitly requested; describe outcomes, not solutions.",
  feature:
    "FEATURE: Keep the total implementation breadth comparable to one bounded feature with several cooperating units. Do not expand into a complete product. Include milestones only when explicitly requested; never reveal the solution.",
  system:
    "SYSTEM: Keep the total implementation breadth comparable to a realistic whole-system scenario with a clearly bounded working core and design choices observable in code. Easy systems use one service, one local database, a small API, straightforward modules, and ordinary success/error cases. Their breadth does not require advanced reasoning, concurrency, crash recovery, or production infrastructure. Include simple tests when explicitly requested. State what to implement; do not request written design answers. No deployment or full-product requirement by default. Include milestones when explicitly requested, with definitions of done that do not solve the exercise.",
};
export const scopePolicy = (scope: BuildScope) => policies[scope];
