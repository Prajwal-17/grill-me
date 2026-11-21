import type { GenerateBuildRequest } from "@/shared/types/api";
import type {
  GenerateQuizRequest,
  GenerateStandaloneQuizRequest,
} from "@/features/quizzes/types";

export type GenerationRequest =
  | { kind: "challenge"; requestId: string; input: GenerateBuildRequest }
  | { kind: "quiz"; input: GenerateStandaloneQuizRequest }
  | { kind: "challenge_quiz"; challengeId: string; input: GenerateQuizRequest };
export type GenerationJob = {
  id: string;
  profileId: string;
  kind: GenerationRequest["kind"];
  challengeId: string | null;
  request: GenerationRequest;
  status:
    "queued" | "running" | "needs_input" | "completed" | "failed" | "cancelled";
  phase: "queued" | "preparing" | "generating" | "completed";
  clarification: { question: string; options: string[] } | null;
  error: { code: string; message: string; retryable: boolean } | null;
  resultId: string | null;
  resultTitle: string | null;
  resultNumber: number | null;
  harnessThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  notifiedAt: string | null;
};
export const isGenerating = (job: GenerationJob) =>
  job.status === "queued" || job.status === "running";
export const generationNoun = (job: GenerationJob) =>
  job.kind === "challenge" ? "challenge" : "quiz";
export function generationLabel(job: GenerationJob) {
  if (job.status === "needs_input") return "Needs your answer";
  if (job.status === "failed") return "Generation failed";
  if (job.status === "cancelled") return "Cancelled";
  if (job.status === "completed")
    return `${job.kind === "challenge" ? "Challenge" : "Quiz"} #${job.resultNumber} ready`;
  if (job.status === "queued") return "Queued";
  return job.phase === "preparing"
    ? "Checking request"
    : `Generating ${generationNoun(job)}`;
}
export function generationTitle(job: GenerationJob) {
  if (job.resultTitle) return job.resultTitle;
  if (job.request.kind === "challenge_quiz") return "Quiz for your challenge";
  return job.request.input.prompt;
}
export function generationHref(job: GenerationJob) {
  if (job.status === "needs_input")
    return `/?generation=${encodeURIComponent(job.id)}`;
  if (isGenerating(job)) return `/generations/${encodeURIComponent(job.id)}`;
  if (!job.resultId) return "/";
  if (job.kind === "challenge")
    return `/chat?id=${encodeURIComponent(job.resultId)}`;
  if (job.request.kind === "challenge_quiz")
    return `/chat?id=${encodeURIComponent(job.request.challengeId)}&tab=quizzes&quiz=${encodeURIComponent(job.resultId)}`;
  return `/quizzes?quiz=${encodeURIComponent(job.resultId)}`;
}
