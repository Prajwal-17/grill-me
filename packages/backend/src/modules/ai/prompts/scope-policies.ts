import type { BuildScope } from "../../challenges/challenge.schema";
const policies: Record<BuildScope, string> = {
  focused:
    "FOCUSED: Keep the total implementation small and narrowly bounded. No milestones.",
  feature:
    "FEATURE: Keep the total implementation breadth comparable to one bounded feature with several cooperating units. Do not expand into a complete product. No solution-revealing milestones.",
  system:
    "SYSTEM: Keep the total implementation breadth comparable to a realistic whole-system scenario with a clearly bounded working core and design choices observable in code. Easy systems use one service, one local database, a small API, straightforward modules, and ordinary success/error cases. Their breadth does not require advanced reasoning, concurrency, crash recovery, or production infrastructure. Include simple tests when explicitly requested. State what to implement; do not request written design answers. No deployment or full-product requirement by default. No mandatory milestones.",
};
export const scopePolicy = (scope: BuildScope) => policies[scope];
