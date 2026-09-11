import type { BuildScope } from "../../challenges/challenge.schema";

const SCOPE_POLICIES: Record<BuildScope, string> = {
  focused: `FOCUSED SCOPE
Create one contained implementation behavior with a concise problem statement of at most 1,600 characters.
Keep the boundaries narrow enough to implement and verify directly. Return no implementation milestones.`,
  feature: `FEATURE SCOPE
Create one complete vertical feature made of several units that work together.
The problem statement must be at most 3,000 characters. Include implementation milestones only when they materially improve sequencing; otherwise return an empty list.`,
  system: `SYSTEM SCOPE
Create one implemented pipeline, service, or system with realistic operational constraints.
The problem statement must be at most 5,000 characters. Return 3–7 ordered implementation milestones that all belong to this single workspace.`,
};

export function scopePolicy(scope: BuildScope) {
  return SCOPE_POLICIES[scope];
}
