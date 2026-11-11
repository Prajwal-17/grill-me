import type { ModelSelection } from "@repo/contracts";
import type { ResolvedAgentModel } from "./providers";

export type AgentRuntime = {
  resolve(selection?: ModelSelection): Promise<ResolvedAgentModel>;
  timeoutMs?(): number;
};
