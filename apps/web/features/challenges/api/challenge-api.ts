import { apiRequest } from "../../../shared/lib/api-client";
import type { Challenge } from "../../../shared/types/api";

export const challengeKeys = {
  active: (profileId?: string) => ["challenges", "active", profileId] as const,
  history: (profileId?: string) =>
    ["challenges", "history", profileId] as const,
  detail: (profileId?: string, challengeId?: string) =>
    ["challenges", "detail", profileId, challengeId] as const,
  messages: (challengeId?: string) => ["messages", challengeId] as const,
};

export function getActiveChallenges(profileId: string) {
  return apiRequest<Challenge[]>("/challenges/active", {}, profileId);
}

export function getChallenge(profileId: string, challengeId: string) {
  return apiRequest<Challenge>(`/challenges/${challengeId}`, {}, profileId);
}

export function getChallengeHistory(profileId: string) {
  return apiRequest<Challenge[]>("/challenges/history", {}, profileId);
}

export function generateChallenge(profileId: string, prompt: string) {
  return apiRequest<Challenge>(
    "/challenges/generate",
    { method: "POST", body: JSON.stringify({ prompt }) },
    profileId,
  );
}

export function completeChallenge(profileId: string, challengeId: string) {
  return apiRequest<Challenge>(
    `/challenges/${challengeId}/complete`,
    { method: "POST", body: "{}" },
    profileId,
  );
}
