import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * Inactive seam for Pi's local coding tools. Production grants no host file or
 * shell access. A later feature must add its own access design before returning
 * any tool here; this phase always returns an empty set.
 */
export const LOCAL_TOOLS_ACTIVE = false;

export function createLocalTools(): AgentTool[] {
  return [];
}
