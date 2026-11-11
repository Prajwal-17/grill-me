import { apiRequest } from "@/shared/lib/api-client";
import type { ModelSelection } from "@repo/contracts";
import type {
  GenerateQuizRequest,
  GenerateStandaloneQuizRequest,
  Quiz,
  QuizAnswers,
  QuizAttempt,
  QuizDetail,
  QuizSummary,
} from "../types";

export const quizKeys = {
  list: (profileId: string, challengeId: string | null) =>
    ["quizzes", profileId, challengeId] as const,
  detail: (profileId: string, challengeId: string | null, quizId: string) =>
    ["quiz", profileId, challengeId, quizId] as const,
};
function path(challengeId: string | null, quizId?: string) {
  const base =
    challengeId === null ? "/quizzes" : `/challenges/${challengeId}/quizzes`;
  return base + (quizId ? "/" + quizId : "");
}
export function getQuizzes(
  profileId: string,
  challengeId: string | null,
  includeDeleted = false,
) {
  return apiRequest<QuizSummary[]>(
    path(challengeId) + (includeDeleted ? "?includeDeleted=true" : ""),
    {},
    profileId,
  );
}
export function getQuiz(
  profileId: string,
  challengeId: string | null,
  quizId: string,
) {
  return apiRequest<QuizDetail>(path(challengeId, quizId), {}, profileId);
}
export function generateQuiz(
  profileId: string,
  challengeId: string | null,
  input: GenerateQuizRequest | GenerateStandaloneQuizRequest,
) {
  return apiRequest<Quiz>(
    path(challengeId) + "/generate",
    { method: "POST", body: JSON.stringify(input) },
    profileId,
  );
}
export function regenerateQuizTitle(
  profileId: string,
  challengeId: string | null,
  quizId: string,
) {
  return apiRequest<{ title: string }>(
    path(challengeId, quizId) + "/title/regenerate",
    { method: "POST", body: "{}" },
    profileId,
  );
}
export function deleteQuiz(
  profileId: string,
  challengeId: string | null,
  quizId: string,
) {
  return apiRequest<{ deletedAt: string }>(
    path(challengeId, quizId),
    { method: "DELETE" },
    profileId,
  );
}
export function restoreQuiz(
  profileId: string,
  challengeId: string | null,
  quizId: string,
) {
  return apiRequest<{ deletedAt: null }>(
    path(challengeId, quizId) + "/restore",
    { method: "POST", body: "{}" },
    profileId,
  );
}
export function enhanceQuizPrompt(
  profileId: string,
  prompt: string,
  selection?: ModelSelection,
) {
  return apiRequest<{ prompt: string }>(
    "/quizzes/enhance-prompt",
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
export function startQuizAttempt(
  profileId: string,
  challengeId: string | null,
  quizId: string,
) {
  return apiRequest<QuizAttempt>(
    path(challengeId, quizId) + "/attempts",
    { method: "POST", body: "{}" },
    profileId,
  );
}
export function saveQuizAnswers(
  profileId: string,
  challengeId: string | null,
  quizId: string,
  attemptId: string,
  revision: number,
  answers: QuizAnswers,
  submit = false,
) {
  return apiRequest<QuizAttempt>(
    path(challengeId, quizId) +
      `/attempts/${attemptId}/${submit ? "submit" : "answers"}`,
    {
      method: "POST",
      body: JSON.stringify({ revision, answers }),
    },
    profileId,
  );
}
