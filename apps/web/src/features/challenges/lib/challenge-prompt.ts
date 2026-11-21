import type { Challenge } from "@/shared/types/api";

/**
 * The original request the learner asked for, kept on the challenge's context
 * snapshot when the generation stored it. Old challenges may not carry one.
 */
export function challengePrompt(challenge: Challenge): string | null {
  const request = challenge.contextSnapshot?.currentRequest;
  if (typeof request === "string" && request.trim()) return request.trim();
  return null;
}
