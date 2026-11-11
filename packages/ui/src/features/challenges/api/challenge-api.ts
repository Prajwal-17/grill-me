import { apiRequest } from "@/shared/lib/api-client";
import type {
  Challenge,
  ChallengePreparation,
  GenerateBuildRequest,
  ModelSelection,
} from "@/shared/types/api";

export const challengeKeys = {
  archived: (profileId?: string) =>
    ["challenges", "archived", profileId] as const,
  saved: (profileId?: string) => ["challenges", "saved", profileId] as const,
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

export function getSavedChallenges(profileId: string) {
  return apiRequest<Challenge[]>("/challenges/saved", {}, profileId);
}

export function getArchivedChallenges(profileId: string) {
  return apiRequest<Challenge[]>("/challenges/archived", {}, profileId);
}

export function setChallengeArchived(
  profileId: string,
  challengeId: string,
  archived: boolean,
) {
  return apiRequest<Challenge>(
    `/challenges/${challengeId}/${archived ? "archive" : "restore"}`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function enhanceBuildPrompt(
  profileId: string,
  prompt: string,
  selection?: ModelSelection,
) {
  return apiRequest<{ prompt: string }>(
    "/challenges/enhance-prompt",
    {
      method: "POST",
      body: JSON.stringify({
        prompt,
        ...(selection ? { selection } : {}),
      }),
    },
    profileId,
  );
}

export function getChallengeHistory(profileId: string) {
  return apiRequest<Challenge[]>("/challenges/history", {}, profileId);
}

export function prepareChallenge(
  profileId: string,
  input: Omit<GenerateBuildRequest, "clarificationContext">,
) {
  return apiRequest<ChallengePreparation>(
    "/challenges/prepare",
    { method: "POST", body: JSON.stringify(input) },
    profileId,
  );
}

export function generateChallenge(
  profileId: string,
  input: GenerateBuildRequest,
) {
  return apiRequest<Challenge>(
    "/challenges/generate",
    { method: "POST", body: JSON.stringify(input) },
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
