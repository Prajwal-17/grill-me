import { apiRequest } from "@/shared/lib/api-client";
import type {
  GenerateQuizRequest,
  Quiz,
  QuizAnswers,
  QuizAttempt,
  QuizDetail,
  QuizSummary,
} from "../types";

export const quizKeys = {
  list: (profileId: string, challengeId: string) =>
    ["quizzes", profileId, challengeId] as const,
  detail: (profileId: string, challengeId: string, quizId: string) =>
    ["quiz", profileId, challengeId, quizId] as const,
};
function path(challengeId: string, quizId?: string) {
  return `/challenges/${challengeId}/quizzes${quizId ? "/" + quizId : ""}`;
}
export function getQuizzes(profileId: string, challengeId: string) {
  return apiRequest<QuizSummary[]>(path(challengeId), {}, profileId);
}
export function getQuiz(
  profileId: string,
  challengeId: string,
  quizId: string,
) {
  return apiRequest<QuizDetail>(path(challengeId, quizId), {}, profileId);
}
export function generateQuiz(
  profileId: string,
  challengeId: string,
  input: GenerateQuizRequest,
) {
  return apiRequest<Quiz>(
    path(challengeId) + "/generate",
    { method: "POST", body: JSON.stringify(input) },
    profileId,
  );
}
export function startQuizAttempt(
  profileId: string,
  challengeId: string,
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
  challengeId: string,
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
