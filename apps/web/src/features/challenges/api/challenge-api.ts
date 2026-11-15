import { apiRequest } from "@/shared/lib/api-client";
import type {
  Challenge,
  ChallengePreparation,
  ChallengeWorkspace,
  GenerateBuildRequest,
  ModelSelection,
  ProjectPreparation,
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
  workspace: (profileId?: string, challengeId?: string) =>
    ["challenges", "workspace", profileId, challengeId] as const,
  projectPreparation: (profileId?: string, challengeId?: string) =>
    ["project-preparation", profileId, challengeId] as const,
};

export function getActiveChallenges(profileId: string) {
  return apiRequest<Challenge[]>("/challenges/active", {}, profileId);
}

export function getChallenge(profileId: string, challengeId: string) {
  return apiRequest<Challenge>(`/challenges/${challengeId}`, {}, profileId);
}

export function getChallengeWorkspace(profileId: string, challengeId: string) {
  return apiRequest<ChallengeWorkspace>(
    `/challenges/${challengeId}/workspace`,
    {},
    profileId,
  );
}

export function relinkChallengeWorkspace(
  profileId: string,
  challengeId: string,
) {
  return apiRequest<ChallengeWorkspace>(
    `/challenges/${challengeId}/workspace/relink`,
    { method: "POST" },
    profileId,
  );
}

export function getProjectPreparation(profileId: string, challengeId: string) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation`,
    {},
    profileId,
  );
}

export function startProjectPreparation(
  profileId: string,
  challengeId: string,
  selection?: ModelSelection,
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/start`,
    {
      method: "POST",
      body: JSON.stringify(selection ? { selection } : {}),
    },
    profileId,
  );
}

export function cancelProjectPreparation(
  profileId: string,
  challengeId: string,
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/cancel`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function retryProjectPreparation(
  profileId: string,
  challengeId: string,
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/retry`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function resumeProjectPreparation(
  profileId: string,
  challengeId: string,
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/resume`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function startFreshProjectPreparation(
  profileId: string,
  challengeId: string,
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/fresh`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function approveProjectCommand(
  profileId: string,
  challengeId: string,
  commandId: string,
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/commands/${commandId}/approve`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function rejectProjectCommand(
  profileId: string,
  challengeId: string,
  commandId: string,
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/commands/${commandId}/reject`,
    { method: "POST", body: "{}" },
    profileId,
  );
}

export function authorizeProjectAttemptCommands(
  profileId: string,
  challengeId: string,
  authorization: { install: boolean; network: boolean },
) {
  return apiRequest<ProjectPreparation>(
    `/challenges/${challengeId}/project-preparation/command-authorization`,
    { method: "POST", body: JSON.stringify(authorization) },
    profileId,
  );
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

export function setChallengeStatus(
  profileId: string,
  challengeId: string,
  status: "active" | "paused",
) {
  return apiRequest<Challenge>(
    `/challenges/${challengeId}/status`,
    { method: "POST", body: JSON.stringify({ status }) },
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
