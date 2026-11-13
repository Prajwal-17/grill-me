import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Manifest } from "../../../projects/snapshot";
import { createResearchTools } from "./research";
import { createSnapshotTools } from "./snapshot";

export { createCompletionTool, recordCompletionFailure } from "./completion";
export type { CompletionSpec, CompletionState } from "./completion";
export {
  createResearchTools,
  createResearchWorkspace,
  removeResearchWorkspace,
} from "./research";

export function createTaskTools(options: {
  allowSnapshot: boolean;
  workspace?: string;
  manifest?: Manifest;
  researchWorkspace?: string;
  allowResearch?: boolean;
  allowImages?: boolean;
  signal?: AbortSignal;
}): AgentTool[] {
  const tools: AgentTool<any>[] = [];
  if (options.allowSnapshot && options.workspace && options.manifest)
    tools.push(...createSnapshotTools(options.workspace, options.manifest));
  if (options.allowResearch && options.researchWorkspace)
    tools.push(
      ...createResearchTools({
        workspace: options.researchWorkspace,
        allowImages: options.allowImages,
        signal: options.signal,
      }),
    );
  return tools;
}
