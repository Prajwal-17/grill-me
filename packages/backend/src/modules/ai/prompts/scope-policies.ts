import type { BuildScope } from "../../challenges/challenge.schema";
const policies: Record<BuildScope, string> = {
  focused:
    "FOCUSED: Keep the exercise small and centered on one skill or behavior.",
  feature:
    "FEATURE: Keep the workload comparable to one bounded feature. Include cooperating behavior only when it serves the exercise.",
  system:
    "SYSTEM: Use a realistic scenario with a clearly bounded working core. Calibrate difficulty through relevant interactions and decisions. Add services, storage, deployment, or other infrastructure only when the task requires them.",
};
export const scopePolicy = (scope: BuildScope) => policies[scope];
