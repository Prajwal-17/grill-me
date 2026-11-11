import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Manifest } from "../../../projects/snapshot";
import { createSnapshotTools } from "./snapshot";

export { createCompletionTool, recordCompletionFailure } from "./completion";
export type { CompletionSpec, CompletionState } from "./completion";

export function createTaskTools(options: {
  allowSnapshot: boolean;
  workspace?: string;
  manifest?: Manifest;
}): AgentTool[] {
  if (!options.allowSnapshot || !options.workspace || !options.manifest)
    return [];
  return createSnapshotTools(options.workspace, options.manifest);
}
