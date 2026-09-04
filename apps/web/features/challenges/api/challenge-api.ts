import { apiRequest } from "../../../shared/lib/api-client";
import type { Challenge } from "../../../shared/types/api";

export const challengeKeys = {
  active: (profileId?: string) => ["active-challenge", profileId] as const,
  history: (profileId?: string) => ["challenge-history", profileId] as const,
  messages: (challengeId?: string) => ["messages", challengeId] as const,
};

export function getActiveChallenge(profileId: string) {
  return apiRequest<Challenge | null>("/challenges/active", {}, profileId);
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
